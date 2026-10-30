#!/usr/bin/env python3
"""Assemble only explicitly approved public artifacts; no recursive data copying."""
from pathlib import Path
import shutil
from validate import main as validate
from condition_catalog import main as build_conditions
from funding_catalog import main as build_planning
from startup_catalog import main as build_startup
from bot_briefing import generate as build_bot, workflow_outcomes
ROOT=Path(__file__).resolve().parents[1]
FILES=['index.html', '.nojekyll', '_headers', 'assets/app.js', 'assets/radar-core.js', 'assets/style.css', 'assets/favicon.svg', 'data/programs.json', 'data/monitor.json', 'data/evidence.json', 'data/change_reviews.json', 'eligibility.html', 'assets/eligibility-core.js', 'assets/eligibility-ui.js', 'assets/eligibility.css', 'data/conditions.json', 'attachments.html', 'assets/attachments-core.js', 'assets/attachments-ui.js', 'assets/attachments.css', 'data/attachments.json', 'planning.html', 'assets/planning-core.js', 'assets/planning-ui.js', 'assets/planning.css', 'data/funding_rules.json', 'startup.html', 'assets/startup-core.js', 'assets/startup-ui.js', 'assets/startup.css', 'data/startup_routes.json', 'data/startup_sources.json', 'cashflow.html', 'assets/cashflow-core.js', 'assets/cashflow-ui.js', 'assets/cashflow.css', 'portfolio.html', 'assets/portfolio-execution.js', 'assets/portfolio-core.js', 'assets/portfolio-evidence.js', 'assets/portfolio-bilateral.js', 'assets/portfolio-ui.js', 'assets/portfolio.css', 'applications.html', 'assets/applications-core.js', 'assets/applications-ui.js', 'assets/applications.css', 'assets/application-dossier.js', 'assets/application-dossier-view.js', 'assets/application-plan.js', 'assets/application-plan-view.js']
FILES += ['assets/application-agency.js', 'assets/application-agency.css']
FILES += ['assets/agency-report.js', 'data/agency_discovery.json', 'data/agency_report.md']
FILES += ['assets/agency-evidence.js', 'data/agency_evidence.json', 'data/agency_evidence_report.md']
FILES += ['assets/bot-report.js', 'assets/bot-report.css', 'data/bot_briefing.json', 'data/bot_briefing.md', 'data/bot_feed.xml']
def main():
    build_conditions()
    build_planning()
    build_startup()
    build_bot(outcomes=workflow_outcomes())
    validate()
    dist=ROOT/'dist'
    if dist.exists():shutil.rmtree(dist)
    for name in FILES:
        src=ROOT/name
        if not src.is_file():raise ValueError('Missing public asset: '+name)
        dest=dist/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
    print('Public-only build OK:',len(FILES),'files')
if __name__=='__main__':main()
