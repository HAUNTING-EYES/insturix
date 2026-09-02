"""Shared SSRF boundary for server-generated Editron media source URLs."""

from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlparse


DEFAULT_ALLOWED_HOST_SUFFIXES = (".r2.cloudflarestorage.com", "storage.googleapis.com")


def is_allowed_media_source_url(value: object, additional_suffixes_env: str) -> bool:
    """Allow HTTPS storage hosts only after DNS resolves exclusively to public addresses."""
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return False

    hostname = parsed.hostname.lower().rstrip(".")
    suffixes = set(DEFAULT_ALLOWED_HOST_SUFFIXES)
    suffixes.update(
        entry.strip().lower().lstrip(".")
        for entry in os.getenv(additional_suffixes_env, "").split(",")
        if entry.strip()
    )
    if not any(
        hostname == suffix.lstrip(".")
        or hostname.endswith(suffix if suffix.startswith(".") else f".{suffix}")
        for suffix in suffixes
    ):
        return False

    try:
        addresses = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False
    return bool(addresses) and all(_is_public_address(address[4][0]) for address in addresses)


def _is_public_address(value: str) -> bool:
    candidate = ipaddress.ip_address(value)
    return not (
        candidate.is_private
        or candidate.is_loopback
        or candidate.is_link_local
        or candidate.is_reserved
        or candidate.is_multicast
        or candidate.is_unspecified
    )
