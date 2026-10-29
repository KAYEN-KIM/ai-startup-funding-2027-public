"""Isolated parser process: no network or external document execution."""
import json
import sys
from pathlib import Path
from attachment_core import extract, ExtractError, MAX_FILE

def main():
    try:
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_AS,(650_000_000,650_000_000))
            resource.setrlimit(resource.RLIMIT_CPU,(22,22))
        except ImportError:pass  # Windows: parent enforces sizes and wall timeout.
        path=Path(sys.argv[1])
        if path.stat().st_size>MAX_FILE:raise ExtractError('size_limit')
        print(json.dumps({'ok':True,'extraction':extract(path.read_bytes())},ensure_ascii=False))
    except ExtractError as exc:
        print(json.dumps({'ok':False,'error':str(exc)}))
    except Exception:
        print(json.dumps({'ok':False,'error':'malformed_document'}))
if __name__=='__main__':main()
