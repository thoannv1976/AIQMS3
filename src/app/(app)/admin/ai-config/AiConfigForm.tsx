"use client";

import { useActionState, useState, useTransition } from "react";
import { Zap } from "lucide-react";
import { Button, Input, Label, Select } from "@/components/ui";
import { saveAiConfigAction, testConnectionAction, type ConfigFormState } from "./actions";
import type { ConnectionTestResult } from "@/lib/ai/client";

const MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];

export function AiConfigForm({
  current,
}: {
  current: { model: string; mode: string; keySource: "db" | "env" | "none"; apiKeyLast4: string | null };
}) {
  const [state, formAction, pending] = useActionState<ConfigFormState, FormData>(saveAiConfigAction, {});
  const [testing, startTest] = useTransition();
  const [test, setTest] = useState<ConnectionTestResult | null>(null);

  const sourceLabel =
    current.keySource === "db" ? "CSDL" : current.keySource === "env" ? "biến môi trường" : null;

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="apiKey">Nạp/đổi Claude API key</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder="sk-ant-... (để trống = giữ key hiện tại)"
        />
        <p className="mt-1 text-xs text-slate-500">
          Key được mã hóa AES-256-GCM trước khi lưu vào CSDL.{" "}
          {sourceLabel
            ? `Hiện dùng ••••${current.apiKeyLast4 ?? ""} (nguồn: ${sourceLabel}).`
            : "Chưa cấu hình key."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="model">Model</Label>
          <Input id="model" name="model" list="ai-model-list" defaultValue={current.model} />
          <datalist id="ai-model-list">
            {MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="mode">Chế độ</Label>
          <Select id="mode" name="mode" defaultValue={current.mode}>
            <option value="auto">Tự động (có key → Claude)</option>
            <option value="real">Bắt buộc dùng Claude</option>
            <option value="mock">Mô phỏng (luôn dự phòng)</option>
          </Select>
        </div>
      </div>

      {current.keySource === "db" && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="clearKey" className="h-4 w-4 rounded border-slate-300" />
          Xóa API key đang lưu trong CSDL (quay về dùng biến môi trường nếu có)
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu cấu hình AI"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={testing}
          onClick={() => startTest(async () => setTest(await testConnectionAction()))}
        >
          <Zap className="h-4 w-4" />
          {testing ? "Đang kiểm tra…" : "Kiểm tra kết nối Claude"}
        </Button>
      </div>

      {state.message && <p className="text-sm font-medium text-green-700">{state.message}</p>}
      {state.error && <p className="text-sm font-medium text-red-700">{state.error}</p>}
      {test && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            test.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {test.message}
          {test.ok && test.inputTokens != null
            ? ` (input ${test.inputTokens} · output ${test.outputTokens} tokens)`
            : ""}
        </div>
      )}
    </form>
  );
}
