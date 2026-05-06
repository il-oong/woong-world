import { CheongakClient } from "./CheongakClient";

export const metadata = {
  title: "청약알리미 — Woong Hub",
  description: "내 조건에 맞는 청약만 골라서 알려드립니다",
};

export default function CheongakPage() {
  return <CheongakClient />;
}
