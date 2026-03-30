import asyncio
from typing import List

import httpx
from redis.asyncio import Redis

from core.config import get_settings

settings = get_settings()

_REDIS_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days
_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1400"
_SDXL_VERSION = "7762fd07cf82c948538e41f63f77d685e02b063e37291c27c4a246c5e4699c6e"


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
    Generate a fantasy map image using Replicate SDXL and cache the URL in Redis.
    Falls back to a static dark-fantasy image if Replicate is unavailable.
    """
    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    cache_key = f"map_image:{subject_id}:{module_number}"

    try:
        cached = await redis.get(cache_key)
        if cached:
            return str(cached)
    except Exception:
        pass  # Redis unavailable — continue to generation

    if not settings.REPLICATE_API_KEY:
        await redis.aclose()
        return _FALLBACK_IMAGE

    try:
        prompt = _build_prompt(module_title, topics_list)
        image_url: str | None = None

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://api.replicate.com/v1/predictions",
                headers={
                    "Authorization": f"Bearer {settings.REPLICATE_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "version": _SDXL_VERSION,
                    "input": {
                        "prompt": prompt,
                        "negative_prompt": "text, labels, watermark, logo, signatures",
                        "width": 1280,
                        "height": 800,
                        "num_outputs": 1,
                        "num_inference_steps": 35,
                        "guidance_scale": 7.5,
                    },
                },
            )
            resp.raise_for_status()
            prediction = resp.json()
            prediction_id = prediction["id"]

            for _ in range(30):
                await asyncio.sleep(3)
                poll = await client.get(
                    f"https://api.replicate.com/v1/predictions/{prediction_id}",
                    headers={"Authorization": f"Bearer {settings.REPLICATE_API_KEY}"},
                )
                poll.raise_for_status()
                result = poll.json()
                if result.get("status") == "succeeded":
                    image_url = _extract_first_url(result.get("output"))
                    break
                elif result.get("status") == "failed":
                    break

        if image_url:
            try:
                await redis.set(cache_key, image_url, ex=_REDIS_TTL_SECONDS)
            except Exception:
                pass
            return image_url

        return _FALLBACK_IMAGE

    except Exception:
        return _FALLBACK_IMAGE

    finally:
        try:
            await redis.aclose()
        except Exception:
            pass
