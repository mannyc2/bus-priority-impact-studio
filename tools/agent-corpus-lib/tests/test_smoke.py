"""Load each module against the real 2026-03 corpus."""

from bp_corpus import findings, routes, signals

MONTH = "2026-03"


def test_routes_ids() -> None:
    rs = routes.ids(MONTH)
    assert len(rs) > 100
    assert all(isinstance(r, str) and r for r in rs)
    assert rs == sorted(rs)


def test_signals_features_dicts() -> None:
    rows = signals.features(MONTH)
    assert len(rows) > 100
    assert {"routeId", "month", "window", "routeWeightedAverageSpeedMph"} <= rows[0].keys()


def test_signals_features_df() -> None:
    df = signals.features_df(MONTH)
    assert len(df) == len(signals.features(MONTH))
    assert "routeId" in df.columns


def test_signals_for_route() -> None:
    rs = routes.ids(MONTH)
    rows = signals.for_route(rs[0], MONTH)
    assert rows
    assert all(r["routeId"] == rs[0] for r in rows)


def test_review_packets() -> None:
    packets = findings.review_packets(MONTH)
    assert packets
    p = packets[0]
    assert "packetId" in p and "candidate" in p
    ranks = [p["reviewRank"] for p in packets]
    assert ranks == sorted(ranks)


def test_promoted_findings() -> None:
    fs = findings.promoted_findings(MONTH)
    assert fs
    assert "promotedFindingId" in fs[0]


def test_context_appendix_route_lookup() -> None:
    rs = routes.ids(MONTH)
    appendix = findings.context_appendix(MONTH, rs[0])
    assert isinstance(appendix, dict)


def test_detector_specs() -> None:
    specs = findings.detector_specs()
    assert specs["artifactKind"] == "finding_detector_specs"
