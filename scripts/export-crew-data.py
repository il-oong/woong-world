"""
woongs_obsidian_sync.py에서 크루 데이터를 추출하여 JSON으로 내보내는 스크립트.
사용법: python scripts/export-crew-data.py
"""

import sys, os, json, re

# sync 스크립트가 있는 디렉토리를 path에 추가
SYNC_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, SYNC_DIR)

from woongs_obsidian_sync import CEO, TEAMS

OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "src", "data"))
os.makedirs(OUT_DIR, exist_ok=True)

def extract_id(name: str) -> str:
    m = re.search(r"\((\w+)\)", name)
    if m:
        return m.group(1).lower()
    # fallback: 한글 이름 그대로
    return name.split()[0].lower()

def build_crew():
    crew = []
    prompts = {}

    # CEO
    ceo_id = extract_id(CEO["name"])
    crew.append({
        "id": ceo_id,
        "name": CEO["name"],
        "role": CEO["role"],
        "emoji": CEO["emoji"],
        "team": "CEO",
        "teamId": "ceo",
        "tier": 1,
        "isLeader": True,
        "tags": CEO["tags"],
        "desc": CEO["desc"],
    })
    prompts[ceo_id] = CEO["prompt"]

    # Teams
    for team in TEAMS:
        for member in team["members"]:
            mid = extract_id(member["name"])
            tier = 4 if "Intern" in member.get("role", "") else (2 if member.get("is_leader") else 3)
            crew.append({
                "id": mid,
                "name": member["name"],
                "role": member["role"],
                "emoji": member["emoji"],
                "team": team["name"],
                "teamId": team["id"],
                "tier": tier,
                "isLeader": member.get("is_leader", False),
                "tags": member.get("tags", []),
                "desc": member.get("desc", ""),
            })
            prompts[mid] = member.get("prompt", "")

    return crew, prompts

def build_teams(crew):
    teams = []
    for team in TEAMS:
        leader_id = extract_id(team["leader"])
        member_ids = [extract_id(m["name"]) for m in team["members"]]
        teams.append({
            "id": team["id"],
            "name": team["name"],
            "emoji": team["emoji"],
            "leader": leader_id,
            "rnr": team.get("rnr", []),
            "memberIds": member_ids,
        })
    return teams

def write_json(filename, data):
    path = os.path.join(OUT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  -> {path} ({len(json.dumps(data, ensure_ascii=False))} chars)")

if __name__ == "__main__":
    print("Exporting crew data...")
    crew, prompts = build_crew()
    teams = build_teams(crew)

    write_json("crew.json", crew)
    write_json("prompts.json", prompts)
    write_json("teams.json", teams)

    print(f"Done. {len(crew)} members, {len(teams)} teams.")
