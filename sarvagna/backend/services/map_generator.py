import asyncio
from typing import List

import replicate
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


def _extract_first_url(replicate_output: object) -> str | None:
  # Replicate SDXL typically returns a list of URLs.
  if isinstance(replicate_output, str):
    return replicate_output
  if isinstance(replicate_output, list) and replicate_output:
    if isinstance(replicate_output[0], str):
      return replicate_output[0]
    try:
      # Handle nested structures like [{ "url": "..." }]
      if isinstance(replicate_output[0], dict) and replicate_output[0].get("url"):
        return str(replicate_output[0]["url"])
    except Exception:
      return None
  try:
    # Try first element from any iterable (including generators).
    first = next(iter(replicate_output))  # type: ignore[arg-type]
    if isinstance(first, str):
      return first
    if isinstance(first, dict) and first.get("url"):
      return str(first["url"])
  except Exception:
    return None
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

  # Replicate's Python SDK uses the env var `REPLICATE_API_TOKEN` by default.
  # We'll set it locally for this process as a best-effort.
  # (We don't persist any secrets; this runs server-side only.)
  import os

  os.environ.setdefault("REPLICATE_API_TOKEN", settings.REPLICATE_API_KEY)

  prompt = _build_prompt(module_title, topics_list)

  def _run_replicate() -> object:
    return replicate.run(
      "stability-ai/sdxl",
      input={
        "prompt": prompt,
        "negative_prompt": "text, labels, watermark, logo, signatures",
        "width": 1280,
        "height": 800,
        "num_outputs": 1,
        "num_inference_steps": 35,
        "guidance_scale": 7.5,
      },
    )

  replicate_output = await asyncio.to_thread(_run_replicate)
  image_url = _extract_first_url(replicate_output)
  if not image_url:
    await redis.aclose()
    raise RuntimeError("Replicate did not return an image URL")

  await redis.set(cache_key, image_url, ex=_REDIS_TTL_SECONDS)
  await redis.aclose()
  return image_url

