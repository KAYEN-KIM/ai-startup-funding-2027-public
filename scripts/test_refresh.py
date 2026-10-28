#!/usr/bin/env python3
"""No-secret contract checks for the Bizinfo public-only indexer."""
import datetime as dt
from refresh import AI_TITLE, convert_xml, parse_range, prune_api_false_positives

def test_dates():
    expected=("2026-10-28","2026-10-31")
    for raw in (
        "20261028 ~ 20261031",
        "2026-10-28 ~ 2026-10-31",
        "2026.10.28 ~ 2026.10.31",
        "2026년 10월 28일 ~ 2026년 10월 31일",
        "2026/10/28 ~ 2026/10/31",
    ):
        assert parse_range(raw)==expected, raw
    assert parse_range("추후 공지")== (None,None)
    assert parse_range("2026-10-28 ~ 예산 소진") == ("2026-10-28",None)

def test_relevance():
    assert not AI_TITLE.search("2027년 철도 R&D 참여기업")
    assert not AI_TITLE.search("2026년 일반 창업자금 융자")
    assert not AI_TITLE.search("2026년 청년 창업공간 모집")
    assert AI_TITLE.search("2027년 AI 초격차 딥테크 과제")
    assert AI_TITLE.search("2026년 지역거점 AX 혁신")
    assert AI_TITLE.search("2026년 Physical AI 기반 의료로봇")

def test_import():
    sample=b"""<rss><channel>
    <item>
      <title>2027\xeb\x85\x84 AI \xec\xb0\xbd\xec\x97\x85 \xec\xa7\x80\xec\x9b\x90 \xea\xb3\xb5\xea\xb3\xa0</title>
      <seq>PBLN_000000000127501</seq>
      <reqstDt>2026.10.28 ~ 2026.11.30</reqstDt>
      <trgetNm>AI \xea\xb8\xb0\xec\x97\x85</trgetNm>
      <link>https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000127501</link>
    </item>
    <item>
      <title>2026\xeb\x85\x84 \xec\x9d\xbc\xeb\xb0\x98 \xec\xb0\xbd\xec\x97\x85\xec\x9e\x90\xea\xb8\x88 \xea\xb3\xb5\xea\xb3\xa0</title>
      <seq>PBLN_000000000127502</seq>
      <description>AI \xea\xb4\x80\xeb\xa0\xa8\xec\x97\x85\xec\xa2\x85 \xec\x9d\xbc\xeb\xb6\x80 \xec\xa7\x80\xec\x9b\x90</description>
      <reqstDt>2026.10.28 ~ 2026.11.30</reqstDt>
    </item>
    </channel></rss>"""
    records,fetched=convert_xml(sample,dt.date(2026,10,28))
    assert fetched==2
    assert len(records)==1, records
    assert records[0]["mode"]=="discovery"
    assert records[0]["deadline"]=="2026-11-30"

def test_prune():
    x={"items":[
       {"title":"AI R&D", "source_level":"verified_full_notice"},
       {"title":"2027년 철도 R&D", "source_level":"official_api_index_not_full_application_verified"},
       {"title":"2026년 AI 창업", "source_level":"official_api_index_not_full_application_verified"}
    ]}
    assert prune_api_false_positives(x)==1
    assert len(x["items"])==2

if __name__=="__main__":
    for f in (test_dates,test_relevance,test_import,test_prune):
        f()
        print(f.__name__+": pass")
