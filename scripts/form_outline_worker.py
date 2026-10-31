"""P0.21 local document form-heading extraction worker. No network, no AI."""
import json
import sys
from pathlib import Path
from attachment_core import ExtractError, MAX_FILE
from form_outline_core import extract_outline

def main():
    try:
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_AS,(650_000_000,650_000_000))
            resource.setrlimit(resource.RLIMIT_CPU,(22,22))
        except ImportError:
            pass  # Windows: parent enforces 30s timeout.
        source=Path(sys.argv[1])
        if not source.is_file() or source.stat().st_size>MAX_FILE:
            raise ExtractError("size_limit")
        data=extract_outline(source.read_bytes(),sys.argv[2],sys.argv[3])
        text=json.dumps({"ok":True,"result":data},ensure_ascii=False,separators=(",",":"))
        if len(text.encode("utf-8"))>100_000:
            raise ExtractError("size_limit")
        print(text)
    except ExtractError as exc:
        print(json.dumps({"ok":False,"error":str(exc)}))
    except ValueError:
        print(json.dumps({"ok":False,"error":"invalid_metadata"}))
    except Exception:
        print(json.dumps({"ok":False,"error":"malformed_document"}))

if __name__=="__main__":
    main()
