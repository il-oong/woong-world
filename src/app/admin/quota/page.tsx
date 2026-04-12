"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

interface TokenLimitConfig {
  userId: string;
  monthlyTokenLimit: number;
  lastUpdatedBy: string;
  lastUpdatedAt: string;
}

interface QuotaData {
  configs: TokenLimitConfig[];
}

export default function AdminQuotaPage() {
  const { user, loading } = useAuth();
  const [configs, setConfigs] = useState<TokenLimitConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number | "">("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      setError("인증되지 않음");
      setIsLoading(false);
      return;
    }

    if (loading) return;

    fetchConfigs();
  }, [user, loading]);

  async function fetchConfigs() {
    try {
      setIsLoading(true);
      const idToken = await user?.getIdToken();
      if (!idToken) {
        setError("토큰을 가져올 수 없음");
        return;
      }

      const res = await fetch("/api/admin/quota", {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data: QuotaData = await res.json();
      setConfigs(data.configs);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch quota configs:", err);
      setError(err instanceof Error ? err.message : "설정을 불러올 수 없음");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSetLimit(userId: string, limit: number) {
    try {
      setIsSaving(true);
      const idToken = await user?.getIdToken();
      if (!idToken) {
        setError("토큰을 가져올 수 없음");
        return;
      }

      const res = await fetch("/api/admin/quota", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, monthlyTokenLimit: limit }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      setEditingUserId(null);
      setEditValue("");
      await fetchConfigs();
    } catch (err) {
      console.error("Failed to set token limit:", err);
      setError(err instanceof Error ? err.message : "설정을 저장할 수 없음");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReset(userId: string) {
    try {
      setIsSaving(true);
      const idToken = await user?.getIdToken();
      if (!idToken) {
        setError("토큰을 가져올 수 없음");
        return;
      }

      const res = await fetch("/api/admin/quota", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      await fetchConfigs();
    } catch (err) {
      console.error("Failed to reset token limit:", err);
      setError(err instanceof Error ? err.message : "초기화할 수 없음");
    } finally {
      setIsSaving(false);
    }
  }

  if (loading || isLoading) {
    return <div className="p-6">로딩 중...</div>;
  }

  if (!user) {
    return <div className="p-6 text-red-600">인증이 필요합니다</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">토큰 할당량 관리</h1>

      {error && <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 px-4 py-2 text-left">사용자 ID</th>
              <th className="border border-gray-300 px-4 py-2 text-left">월간 한도</th>
              <th className="border border-gray-300 px-4 py-2 text-left">마지막 수정</th>
              <th className="border border-gray-300 px-4 py-2 text-left">작업</th>
            </tr>
          </thead>
          <tbody>
            {configs.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-gray-300 px-4 py-2 text-center text-gray-500">
                  커스텀 설정이 없습니다 (모두 기본값 500,000사용)
                </td>
              </tr>
            ) : (
              configs.map((config) => (
                <tr key={config.userId}>
                  <td className="border border-gray-300 px-4 py-2">{config.userId}</td>
                  <td className="border border-gray-300 px-4 py-2">
                    {editingUserId === config.userId ? (
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value ? Number(e.target.value) : "")}
                        className="border border-blue-300 px-2 py-1 rounded w-40"
                        min="1"
                      />
                    ) : (
                      config.monthlyTokenLimit.toLocaleString()
                    )}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm text-gray-600">
                    {new Date(config.lastUpdatedAt).toLocaleDateString("ko-KR")} by{" "}
                    {config.lastUpdatedBy}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 space-x-2">
                    {editingUserId === config.userId ? (
                      <>
                        <button
                          onClick={() => {
                            if (editValue && editValue > 0) {
                              handleSetLimit(config.userId, Number(editValue));
                            }
                          }}
                          disabled={isSaving || !editValue || editValue <= 0}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => {
                            setEditingUserId(null);
                            setEditValue("");
                          }}
                          disabled={isSaving}
                          className="bg-gray-400 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingUserId(config.userId);
                            setEditValue(config.monthlyTokenLimit);
                          }}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleReset(config.userId)}
                          disabled={isSaving}
                          className="bg-orange-500 text-white px-3 py-1 rounded text-sm hover:bg-orange-600 disabled:opacity-50"
                        >
                          초기화
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h2 className="font-bold mb-2">기본 설정</h2>
        <p>기본 월간 토큰 한도: 500,000토큰</p>
        <p className="text-sm text-gray-600 mt-2">
          커스텀 설정이 없는 사용자는 자동으로 기본값을 사용합니다.
        </p>
      </div>
    </div>
  );
}
