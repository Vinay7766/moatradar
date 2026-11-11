"""SSRF protection and evidence sanitization helpers."""

import ipaddress
import re
import socket
from urllib.parse import urlparse


class UnsafeUrlError(ValueError):
    """Raised when a URL fails scheme, hostname, or public-IP validation."""


_BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
}

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WHITESPACE_RE = re.compile(r"\s+")


def _is_public_ip(ip_str: str) -> bool:
    """Return True only when an IP address is globally routable."""
    ip_obj = ipaddress.ip_address(ip_str)
    return not (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_multicast
        or ip_obj.is_reserved
        or ip_obj.is_unspecified
    )


def validate_public_url(raw_url: str) -> str:
    """Validate that raw_url is http(s) and resolves exclusively to public IPs."""
    url = raw_url.strip()
    if not url:
        raise UnsafeUrlError("URL cannot be empty.")

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError(f"Unsupported URL scheme: {parsed.scheme!r}")
    if not parsed.hostname:
        raise UnsafeUrlError("URL is missing a hostname.")

    hostname = parsed.hostname.lower().rstrip(".")
    if hostname in _BLOCKED_HOSTNAMES:
        raise UnsafeUrlError(f"Blocked internal hostname: {hostname}")

    # Direct IP literal check before DNS lookup
    try:
        if not _is_public_ip(hostname):
            raise UnsafeUrlError(f"Blocked non-public IP address: {hostname}")
        return url
    except ValueError:
        pass

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        addr_info = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"DNS resolution failed for {hostname}: {exc}") from exc

    if not addr_info:
        raise UnsafeUrlError(f"No DNS records returned for {hostname}")

    for _, _, _, _, sockaddr in addr_info:
        ip_str = sockaddr[0]
        if not _is_public_ip(ip_str):
            raise UnsafeUrlError(f"Blocked DNS resolution to non-public IP {ip_str} for {hostname}")

    return url


def sanitize_evidence_text(text: str, max_chars: int = 3500) -> str:
    """Strip control characters, collapse whitespace, and bound snippet length."""
    cleaned = _CONTROL_CHARS_RE.sub("", text)
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    if len(cleaned) > max_chars:
        return cleaned[: max_chars - 3].rstrip() + "..."
    return cleaned
