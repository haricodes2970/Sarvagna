# AI Pipeline

Sarvagna uses a retrieval augmented generation (RAG) pipeline with a scraping and chunking ingestion step and a query time answer step.

## Ingestion Flow
1. Scrape content for a subject module using Scraper Agent.
2. Chunk the text into 512 token chunks with a 50 token overlap.
3. Embed each chunk with Ollama using the nomic-embed-text model.
4. Store vectors in Qdrant using a collection name like <subject_slug>_module_<n>.

Chunking details:
- Chunk size: 512 tokens
- Overlap: 50 tokens
- Embedding dimension: 768

## Query Flow
1. Orchestrator checks Redis cache for an exact question+subject match.
2. If cache miss, Teacher Agent embeds the question with Ollama.
3. Teacher Agent searches Qdrant across collections that start with the subject slug.
4. Top K = 8 with a score threshold of 0.65 are used as context.
5. Teacher Agent builds a prompt and calls Groq (llama-3.3-70b-versatile).
6. The response is parsed as JSON and cached in Redis for 24 hours.
7. Orchestrator awards XP, updates streak, and checks badges.

## Prompt Template
Teacher Agent builds a prompt that includes context and requests strict JSON output:
```
You are Sarvagna, an expert academic tutor. Answer the student's question using the provided context.

CONTEXT:
<chunk1>
---
<chunk2>

QUESTION: <user_question>

Respond with ONLY valid JSON in this format:
{
  "exact_answer": "...",
  "simplified_answer": "...",
  "real_world_example": "..."
}
```

## 3 Format Answer
The API always returns three fields:
- exact_answer: precise, textbook style response
- simplified_answer: first year friendly explanation
- real_world_example: analogy or applied example

## Caching
- Redis key format: sarvagna:answer:<sha256(subject::question)>
- TTL: 24 hours
