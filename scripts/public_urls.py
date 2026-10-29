"""Stable public document identities; temporary public link signatures stay in memory.

This handles only the publicly linked Bizinfo file/image download transport parameter.
It neither requests credentials nor synthesizes, decodes or guesses signatures.
"""
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

def stable_attachment_url(value):
    if not isinstance(value,str):return value
    try:
        u=urlsplit(value);host=(u.hostname or '').lower()
        if u.scheme!='https' or u.port not in (None,443) or u.username or u.password:return value
        if not (host=='bizinfo.go.kr' or host.endswith('.bizinfo.go.kr')) or u.path.casefold() not in {'/cmm/fms/filedown.do','/cmm/fms/getimagefile.do'}:return value
        pairs=parse_qsl(u.query,keep_blank_values=True)
        if not {'atchfileid','filesn'}<={k.casefold() for k,v in pairs}:return value
        if not any(k.casefold()=='downloadtoken' for k,v in pairs):return value
        return urlunsplit((u.scheme,u.netloc,u.path,urlencode([(k,v) for k,v in pairs if k.casefold()!='downloadtoken']),u.fragment))
    except (ValueError,TypeError):return value

def scrub_transport_urls(value):
    """Copy JSON-compatible public metadata without persisting temporary file signatures."""
    if isinstance(value,str):return stable_attachment_url(value)
    if isinstance(value,list):return [scrub_transport_urls(v) for v in value]
    if isinstance(value,dict):return {k:scrub_transport_urls(v) for k,v in value.items()}
    return value
