"""
Graphiti Knowledge Graph — Test Connection + First Episode

Run: python scripts/graphiti-test.py

Requires env vars: GEMINI_API_KEY, NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE
"""
import asyncio
import os
from datetime import datetime


async def main():
    from graphiti_core import Graphiti
    from graphiti_core.llm_client.gemini_client import GeminiClient
    from graphiti_core.llm_client import LLMConfig
    from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig
    from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
    from graphiti_core.driver.neo4j_driver import Neo4jDriver

    api_key = os.environ["GEMINI_API_KEY"]

    driver = Neo4jDriver(
        uri=os.environ["NEO4J_URI"],
        user=os.environ["NEO4J_USERNAME"],
        password=os.environ["NEO4J_PASSWORD"],
        database=os.environ["NEO4J_DATABASE"],
    )

    graphiti = Graphiti(
        graph_driver=driver,
        llm_client=GeminiClient(LLMConfig(api_key=api_key, model="gemini-2.5-flash")),
        embedder=GeminiEmbedder(GeminiEmbedderConfig(api_key=api_key, embedding_model="gemini-embedding-001", embedding_dim=768)),
        cross_encoder=GeminiRerankerClient(LLMConfig(api_key=api_key, model="gemini-2.5-flash")),
    )

    await graphiti.build_indices_and_constraints()
    print("Connected + indices ready")

    print("Adding vision episode...")
    await graphiti.add_episode(
        name="vision_core",
        episode_body=(
            "Insturix is a production-grade video editing platform. "
            "Vision: replace Adobe and DaVinci entirely. "
            "Automatic car model: works perfectly in auto mode, switches to manual smoothly, "
            "heavy lifting never leaves the user. "
            "Three graph layers: Creative Knowledge (from creative doc v2), "
            "Brand DNA (per client), User Preferences (per user). "
            "Rule-driven over probabilistic. Deterministic by default. "
            "Must work across all content types: product ads, brand films, tutorials, UGC, corporate."
        ),
        source_description="Insturix Vision Document",
        reference_time=datetime.now(),
    )
    print("Vision episode added!")

    print("\nSearching...")
    results = await graphiti.search("What is Insturix?")
    print(f"Found {len(results)} results:")
    for r in results[:5]:
        print(f"  {r.fact}" if hasattr(r, "fact") else f"  {r}")

    await graphiti.close()
    print("\nGraphiti is LIVE on Neo4j Aura")


if __name__ == "__main__":
    asyncio.run(main())

