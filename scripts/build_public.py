#!/usr/bin/env python3
"""Assemble only explicitly approved public artifacts; no recursive data copying."""
from pathlib import Path
import shutil
from validate import main as validate
ROOT=Path(__file__).resolve().parents[1]
FILES=['index.html','.nojekyll','_headers','assets/app.js','assets/radar-core.js','assets/style.css','assets/favicon.svg','data/programs.json','data/monitor.json','data/evidence.json','data/change_reviews.json']
def main():
    validate()
    dist=ROOT/'dist'
    if dist.exists():shutil.rmtree(dist)
    for name in FILES:
        src=ROOT/name
        if not src.is_file():raise ValueError('Missing public asset: '+name)
        dest=dist/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
    print('Public-only build OK:',len(FILES),'files')
if __name__=='__main__':main()
