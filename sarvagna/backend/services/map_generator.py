import asyncio

import httpx

from core.config import get_settings

settings = get_settings()

_FALLBACK_IMAGE = "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1400"


async def generate_module_map(module_title: str, topics_list: list) -> str:
    topics_str = ", ".join(topics_list[:5])
    prompt = (
        f"top down 2D fantasy game world map, dark background, glowing teal rivers, "
        f"golden castle nodes, fog of war, Genshin Impact style, {module_title}, "
        f"{topics_str}, no text, cinematic"
    )

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.replicate.com/v1/predictions",
            headers={
                "Authorization": f"Bearer {settings.REPLICATE_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "version": "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
                "input": {
                    "prompt": prompt,
                    "width": 1024,
                    "height": 576,
                    "num_inference_steps": 30,
                },
            },
        )

        if resp.status_code != 201:
            return _FALLBACK_IMAGE

        prediction = resp.json()
        prediction_id = prediction["id"]

        for _ in range(40):
            await asyncio.sleep(3)
            poll = await client.get(
                f"https://api.replicate.com/v1/predictions/{prediction_id}",
                headers={"Authorization": f"Bearer {settings.REPLICATE_API_KEY}"},
            )
            result = poll.json()
            if result["status"] == "succeeded":
                return result["output"][0]
            elif result["status"] == "failed":
                return _FALLBACK_IMAGE

        return _FALLBACK_IMAGE
