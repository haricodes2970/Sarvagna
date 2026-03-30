import asyncio
from typing import List

import httpx
from redis.asyncio import Redis

from core.config import get_settings

settings = get_settings()

_REDIS_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


def _build_prompt(module_title: str, topics_list: List[str]) -> str:
  topics = ", ".join(topics_list) if topics_list else "key topics"
  return (
    "Top-down 2D fantasy game world map, dark background, "
    "glowing teal rivers as paths, golden castle nodes, "
    "fog of war on edges, Genshin Impact style, "
    f"for a module called {module_title} covering {topics}, "
    "no text, no labels, cinematic lighting, detailed terrain"
  )


def _extract_first_url(output: object) -> str | None:
  # Replicate output is commonly a list of URLs, but can also be a single string.
  if isinstance(output, str):
    return output
  if isinstance(output, list) and output:
    if isinstance(output[0], str):
      return output[0]
    if isinstance(output[0], dict) and output[0].get("url"):
      return str(output[0]["url"])
  return None


async def generate_module_map(
  subject_id: str,
  module_number: int,
  module_title: str,
  topics_list: List[str],
) -> str:
  """
  Generate a fantasy map image using Replicate and cache the resulting URL in Redis.
  """
  redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
  cache_key = f"map_image:{subject_id}:{module_number}"

  cached = await redis.get(cache_key)
  if cached:
    await redis.aclose()
    return str(cached)

  if not settings.REPLICATE_API_KEY:
    await redis.aclose()
    raise RuntimeError("REPLICATE_API_KEY is not configured")

  prompt = _build_prompt(module_title, topics_list)

  async with httpx.AsyncClient(timeout=60) as client:
    # Create prediction
    resp = await client.post(
      "https://api.replicate.com/v1/models/stability-ai/sdxl/predictions",
      headers={
        "Authorization": f"Bearer {settings.REPLICATE_API_KEY}",
        "Content-Type": "application/json",
      },
      json={
        "input": {
          "prompt": prompt,
          "negative_prompt": "text, labels, watermark, logo, signatures",
          "width": 1280,
          "height": 800,
          "num_outputs": 1,
          "num_inference_steps": 35,
          "guidance_scale": 7.5,
        }
      },
    )
    resp.raise_for_status()
    prediction = resp.json()
    prediction_id = prediction["id"]

    # Poll for result
    for _ in range(30):
      await asyncio.sleep(3)
      poll = await client.get(
        f"https://api.replicate.com/v1/predictions/{prediction_id}",
        headers={"Authorization": f"Bearer {settings.REPLICATE_API_KEY}"},
      )
      poll.raise_for_status()
      result = poll.json()
      if result.get("status") == "succeeded":
        output = result.get("output")
        image_url = _extract_first_url(output)
        if image_url:
          break
        image_url = None
      elif result.get("status") == "failed":
        raise RuntimeError("Replicate image generation failed")
    else:
      raise RuntimeError("Timeout waiting for image")

  if not image_url:
    await redis.aclose()
    raise RuntimeError("Replicate did not return an image URL")

  await redis.set(cache_key, image_url, ex=_REDIS_TTL_SECONDS)
  await redis.aclose()
  return image_url

