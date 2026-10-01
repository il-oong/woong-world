import { test } from "node:test";
import assert from "node:assert/strict";
import { collectYouthHousing, parseLhYouthDetail, parseLhYouthList, parseSeoulYouthDetail, parseSeoulYouthPage } from "../src/lib/housing/youth";
import { applicationStatus } from "../src/lib/housing/model";

const lhList = `<table><tr><td>1</td><td>매입임대</td><td><a class="wrtancInfoBtn" data-id1="2015122300020838" data-id2="03" data-id3="13" data-id4="26"><span>청년매입임대 <em>1일전</em></span></a></td><td>대구광역시 외</td><td>첨부</td><td>2026.09.29</td><td>2026.10.15</td></tr></table>`;
const lhDetail = `<script>var sbscAcpStDt = '2026.10.13'; var sbscAcpClsgDt = '2026.10.15'; var sbscAcpStHm = '10:00'; var sbscAcpClsgHm = '16:00';</script><li>당첨자발표일 : 2026.12.17</li>`;
const seoulPage = { pagingInfo: { totPage: 1 }, resultList: [{ boardId: 6685, nttSj: "[민간임대] 동묘앞역 청계로벤하임 추가모집공고", optn1: "2026-10-01", optn2: "2", optn4: "2026-10-06" }] };
const seoulDetail = `<div><p>■주택위치 : 서울특별시 종로구 숭인동 240-1 외 (동묘앞역)</p></div>`;

test("LH 청년 공고는 상세 페이지의 접수 날짜와 시간만 달력에 싣는다", () => {
  const rows = parseLhYouthList(lhList);
  assert.equal(rows[0].detailUrl.includes("panId=2015122300020838"), true);
  const notice = parseLhYouthDetail(rows[0], lhDetail);
  assert.equal(notice.audience, "youth");
  assert.equal(notice.kind, "rent");
  assert.deepEqual(notice.events.map((event) => [event.type, event.date, event.time]), [
    ["open", "2026-10-13", "10:00"], ["close", "2026-10-15", "16:00"], ["result", "2026-12-17", null],
  ]);
  assert.equal(notice.units[0].price, null);
  assert.equal(notice.rules.length, 0);
});

test("서울 청년안심주택은 공식 청약신청일만 표시하고 주소를 가져온다", () => {
  const { rows } = parseSeoulYouthPage(seoulPage);
  const notice = parseSeoulYouthDetail(rows[0], seoulDetail);
  assert.equal(notice.address, "서울특별시 종로구 숭인동 240-1 외");
  assert.deepEqual(notice.events.map((event) => [event.type, event.date]), [["open", "2026-10-06"]]);
  assert.equal(applicationStatus(notice, new Date("2026-10-07T03:00:00Z")), "접수일 경과 · 기간 원문 확인");
  assert.equal(notice.units[0].monthlyRent, null);
});

test("공식 목록이 비면 기존 데이터가 유지되도록 갱신을 실패시킨다", async () => {
  const fetcher: typeof fetch = async () => new Response("<html></html>", { status: 200 });
  await assert.rejects(collectYouthHousing(new Date("2026-10-01T00:00:00Z"), fetcher), /건수/);
});
