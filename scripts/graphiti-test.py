"""
Graphiti Knowledge Graph — Test Connection + First Episode

Run: python scripts/graphiti-test.py

Connects to Neo4j Aura Free with Gemini as the LLM/embedder.
"""
import asyncio
from datetime import datetime


async def main():
    from graphiti_core import Graphiti
    from graphiti_core.llm_client.gemini_client import GeminiClient
    from graphiti_core.llm_client import LLMConfig
    from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig
    from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
    from graphiti_core.driver.neo4j_driver import Neo4jDriver

    API_KEY = "AIzaSyD5ijse0NoHHljgSAUbaxXEDqJAy2e9vfY"

    driver = Neo4jDriver(
        uri="neo4j+s://1ca64864.databases.neo4j.io",
        user="1ca64864",
        password="eUAoyt928l_Iql7HVDj_Wwy7z3q8RQTbymlyi4XxYU0",
        database="1ca64864",
    )

    graphiti = Graphiti(
        graph_driver=driver,
        llm_client=GeminiClient(LLMConfig(api_key=API_KEY, model="gemini-2.5-flash")),
        embedder=GeminiEmbedder(GeminiEmbedderConfig(api_key=API_KEY, embedding_model="gemini-embedding-001")),
        cross_encoder=GeminiRerankerClient(LLMConfig(api_key=API_KEY, model="gemini-2.5-flash")),
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
