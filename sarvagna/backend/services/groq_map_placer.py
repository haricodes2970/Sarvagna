"""Groq-powered map layout generator for module topic placement."""
import json
import logging

from groq import Groq

from core.config import settings

logger = logging.getLogger(__name__)


async def generate_map_layout(
    module_title: str,
    topics: list,
    map_width: int = 1400,
    map_height: int = 800,
) -> dict:
    """Call Groq llama-3.3-70b to generate topic placement JSON for a fantasy map.

    Returns a dict with keys: capital, cities, villages, roads.
    Falls back to a deterministic spiral layout on any error.
    """
    topics_text = json.dumps([
        {
            "id": t["id"],
            "title": t["title"],
            "subtopics": [
                {"id": s["id"], "title": s["title"]}
                for s in t.get("subtopics", [])
            ],
        }
        for t in topics
    ])

    prompt = f"""You are a game map designer. Place topics on a {map_width}x{map_height} fantasy map.

Module: {module_title}
Topics and subtopics: {topics_text}

PLACEMENT RULES:
- Map center is x=50%, y=50% — place main topic HERE as "capital"
- Topics (cities) spread in a circle around center, distance 25-30% from center
- Each topic goes in a different direction (N=y:20, NE=x:70,y:25, SE=x:72,y:65, S=y:75, SW=x:28,y:65, NW=x:28,y:30)
- Subtopics (villages) cluster near their parent topic, distance 10-15% from parent
- No two nodes within 8% of each other
- Keep all nodes within x:10-90%, y:10-90%
- Roads connect: capital to all cities (type: river), cities to their villages (type: path), related topics (type: dotted)

Return ONLY this exact JSON structure, no explanation:
{{
  "capital": {{"id": "main", "title": "{module_title}", "x": 50, "y": 50, "type": "capital"}},
  "cities": [{{"id": "t1", "title": "topic name", "x": 35, "y": 30, "type": "city"}}],
  "villages": [{{"id": "s1", "title": "subtopic name", "x": 28, "y": 22, "parent": "t1", "type": "village"}}],
  "roads": [{{"from": "main", "to": "t1", "type": "river"}}]
}}"""

    try:
        client = Groq(api_key=settings.GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        # Validate required keys present
        for key in ("capital", "cities", "villages", "roads"):
            if key not in result:
                raise ValueError(f"Missing key '{key}' in Groq response")
        return result
    except Exception as exc:
        logger.warning("Groq map layout failed (%s), using fallback layout", exc)
        return _fallback_layout(module_title, topics)


def _fallback_layout(module_title: str, topics: list) -> dict:
    """Deterministic spiral fallback when Groq is unavailable."""
    import math

    cities = []
    villages = []
    roads = []

    n = len(topics)
    for i, topic in enumerate(topics):
        angle = (i / max(n, 1)) * 2 * math.pi - math.pi / 2
        cx = 50 + 28 * math.cos(angle)
        cy = 50 + 28 * math.sin(angle)
        city_id = topic["id"]
        cities.append({"id": city_id, "title": topic["title"], "x": round(cx, 1), "y": round(cy, 1), "type": "city"})
        roads.append({"from": "main", "to": city_id, "type": "river"})

        subtopics = topic.get("subtopics", [])
        m = len(subtopics)
        for j, sub in enumerate(subtopics):
            sa = angle + (j / max(m, 1)) * math.pi - math.pi / 2
            sx = cx + 13 * math.cos(sa)
            sy = cy + 13 * math.sin(sa)
            sx = max(10, min(90, sx))
            sy = max(10, min(90, sy))
            villages.append({
                "id": sub["id"],
                "title": sub["title"],
                "x": round(sx, 1),
                "y": round(sy, 1),
                "parent": city_id,
                "type": "village",
            })
            roads.append({"from": city_id, "to": sub["id"], "type": "path"})

    return {
        "capital": {"id": "main", "title": module_title, "x": 50, "y": 50, "type": "capital"},
        "cities": cities,
        "villages": villages,
        "roads": roads,
    }
