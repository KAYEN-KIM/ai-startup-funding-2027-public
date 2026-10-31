#!/usr/bin/env python3
"""Offline CLI: extract *candidates*, never publish or approve official forms."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from attachment_core import MAX_FILE, approved_url
from form_outline_core import SCHEMA

ROOT=Path(__file__).resolve().parents[1]
def execute(input_path,output_path,source_url="",label=""):
    if source_url and not approved_url(source_url):
        raise ValueError("source_not_allowlisted_official_https")
    inp=Path(input_path).expanduser().resolve(strict=True)
    out=Path(output_path).expanduser().resolve()
    if not inp.is_file() or inp.suffix.lower() not in (".pdf",".hwp",".hwpx"):
        raise ValueError("unsupported_input")
    if inp.stat().st_size>MAX_FILE:
        raise ValueError("size_limit")
    if out==inp or out.suffix.lower()!=".json":
        raise ValueError("output_must_be_separate_json")
    # No candidate exports into the publicly published repository, even untracked folders.
    if out.is_relative_to(ROOT):
        raise ValueError("output_must_be_outside_public_repository")
    if not out.parent.is_dir():
        raise ValueError("output_directory_missing")
    if out.exists():
        raise ValueError("output_already_exists_choose_new_name")
    if not label:
        label=inp.name
    if any(x in label for x in ("\r","\n")) or len(label)>160:
        raise ValueError("label_invalid")
    env={k:v for k,v in os.environ.items() if k.upper() in
         {"PATH","SYSTEMROOT","WINDIR","HOME","TMP","TEMP","LANG"}}
    env["PYTHONIOENCODING"]="utf-8"
    try:
        proc=subprocess.run(
            [sys.executable,str(ROOT/"scripts"/"form_outline_worker.py"),str(inp),source_url,label],
            cwd=ROOT,env=env,capture_output=True,timeout=30
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError("parser_timeout") from exc
    if proc.returncode or len(proc.stdout)>110_000:
        raise ValueError("parser_process_failed")
    try:
        result=json.loads(proc.stdout.decode("utf-8"))
    except (UnicodeError,ValueError) as exc:
        raise ValueError("parser_invalid_response") from exc
    if result.get("ok") is not True:
        raise ValueError(str(result.get("error","malformed_document"))[:80])
    obj=result["result"]
    if obj.get("schema")!=SCHEMA or obj.get("document",{}).get("source_status")!="self_supplied_unverified":
        raise ValueError("schema_mismatch")
    # Atomic write, private local only. Exclusive create avoids overwriting user files.
    content=json.dumps(obj,ensure_ascii=False,indent=2)+"\n"
    try:
        with out.open("x",encoding="utf-8",newline="\n") as f:
            f.write(content)
    except FileExistsError as exc:
        raise ValueError("output_already_exists_choose_new_name") from exc
    return {"candidate_count":len(obj["candidates"]),"format":obj["document"]["format"],"output_file":out.name}

def main():
    parser=argparse.ArgumentParser(description="Local PDF/HWP/HWPX form heading candidates; no network or AI.")
    parser.add_argument("--input",required=True,help="Downloaded public form file; read-only, max 8MB")
    parser.add_argument("--output",required=True,help="New private JSON path OUTSIDE public repo")
    parser.add_argument("--source-url",default="",help="Optional official public HTTPS notice URL, self-declared")
    parser.add_argument("--label",default="",help="Optional public file name or short label")
    args=parser.parse_args()
    try:
        status=execute(args.input,args.output,args.source_url,args.label)
        print(json.dumps({"status":"candidate_unverified","count":status["candidate_count"],
            "format":status["format"],"output_name":status["output_file"]},ensure_ascii=False))
        return 0
    except ValueError as exc:
        print("FORM_OUTLINE_ERROR: "+str(exc).splitlines()[0][:120],file=sys.stderr)
        return 2
    except OSError:
        # Python filesystem errors can contain full private paths; suppress them.
        print("FORM_OUTLINE_ERROR: filesystem_access_failed",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
