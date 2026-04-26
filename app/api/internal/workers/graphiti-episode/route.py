"""
POST /api/internal/workers/graphiti-episode

QStash worker that ingests episodes into the Graphiti knowledge graph.
Receives natural language episode text, Graphiti extracts entities,
relationships, and temporal facts automatically.

Dispatched by graph-service.ts addGraphitiEpisode() via QStash.
"""

import json
import os
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length))

            episode_type = body.get("type", "unknown")
            name = body.get("name", f"episode_{int(datetime.now().timestamp())}")
            episode_body = body.get("body", "")
            source_description = body.get("sourceDescription", "pipeline")
            group_id = body.get("groupId", "")

            if not episode_body:
                self._respond(400, {"error": "Missing episode body"})
                return

            api_key = os.environ.get("GRAPH_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY", "")
            neo4j_uri = os.environ.get("NEO4J_URI", "")
            neo4j_user = os.environ.get("NEO4J_USERNAME", "")
            neo4j_pass = os.environ.get("NEO4J_PASSWORD", "")
            neo4j_db = os.environ.get("NEO4J_DATABASE", "")

            if not all([api_key, neo4j_uri, neo4j_user, neo4j_pass, neo4j_db]):
                print(f"[GraphitiEpisode] Missing env vars, skipping {episode_type}")
                self._respond(200, {"success": True, "skipped": True, "reason": "missing_env"})
                return

            from graphiti_core import Graphiti
            from graphiti_core.llm_client.gemini_client import GeminiClient
            from graphiti_core.llm_client import LLMConfig
            from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig
            from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
            from graphiti_core.driver.neo4j_driver import Neo4jDriver

            driver = Neo4jDriver(
                uri=neo4j_uri,
                user=neo4j_user,
                password=neo4j_pass,
                database=neo4j_db,
            )

            graphiti = Graphiti(
                graph_driver=driver,
                llm_client=GeminiClient(LLMConfig(api_key=api_key, model="gemini-2.5-flash")),
                embedder=GeminiEmbedder(GeminiEmbedderConfig(api_key=api_key, embedding_model="text-embedding-004")),
                cross_encoder=GeminiRerankerClient(LLMConfig(api_key=api_key, model="gemini-2.5-flash")),
            )

            import asyncio

            async def ingest():
                try:
                    await graphiti.add_episode(
                        name=name,
                        episode_body=episode_body,
                        source_description=source_description,
                        reference_time=datetime.now(),
                        group_id=group_id,
                    )
                finally:
                    await graphiti.close()

            asyncio.run(ingest())

            print(f"[GraphitiEpisode] {episode_type} ingested: {name}")
            self._respond(200, {"success": True, "type": episode_type, "name": name})

        except Exception as e:
            print(f"[GraphitiEpisode] Error: {traceback.format_exc()}")
            self._respond(500, {"success": False, "error": str(e)})

    def _respond(self, status, body):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
