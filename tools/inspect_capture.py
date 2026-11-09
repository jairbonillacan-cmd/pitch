import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
with path.open("r", encoding="utf-8") as f:
    d = json.load(f)

print("evidence_id:", d.get("evidence_id"))
print("limitations:", d.get("limitations"))
nr = d.get("normalized_result", {})
fc = nr.get("final_capture", {})
print("final_url:", fc.get("url"))
print("final_capture keys:", list(fc.keys()))
txs = nr.get("network_transactions", [])
print("network_transactions count:", len(txs))
for tx in txs:
    req = tx.get("request", {})
    resp = tx.get("response", {})
    body_info = resp.get("body", {})
    bstate = body_info.get("state") if isinstance(body_info, dict) else None
    bsize = body_info.get("byte_length") if isinstance(body_info, dict) else None
    print(f"{tx.get('transaction_id')} | {req.get('method')} | {resp.get('status')} | {resp.get('mime_type')} | state={bstate} bytes={bsize} | {req.get('url', {}).get('url')}")
