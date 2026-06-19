"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { Send, Sparkles, FileText, User } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { askAction, type AskResult } from "./actions";

interface Message {
  role: "user" | "assistant";
  text: string;
  usedFallback?: boolean;
  citations?: AskResult["citations"];
}

const SAMPLES = [
  "Tiêu chí 1.2 hiện có những minh chứng nào?",
  "Có minh chứng nào về lấy ý kiến nhà tuyển dụng không?",
  "Chương trình đã cập nhật chuẩn đầu ra dựa trên căn cứ gì?",
  "Tỷ lệ sinh viên có việc làm sau tốt nghiệp là bao nhiêu?",
];

export function ChatBox({ programId }: { programId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    start(async () => {
      const res = await askAction(programId, q);
      setMessages((m) => [...m, { role: "assistant", text: res.text, usedFallback: res.usedFallback, citations: res.citations }]);
    });
  }

  return (
    <div className="flex h-[calc(100vh-220px)] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="font-medium text-slate-700">Hỏi đáp trên kho minh chứng của chương trình</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Trợ lý trả lời dựa trên tài liệu đã được tải lên và phân quyền. Thử một câu hỏi mẫu:
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SAMPLES.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <Sparkles className="h-4 w-4" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-50 text-slate-800"}`}>
              <p className="prose-ai">{m.text}</p>
              {m.usedFallback && (
                <Badge color="amber" className="mt-2">
                  chế độ dự phòng (chưa bật Claude API)
                </Badge>
              )}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                  <p className="text-xs font-medium text-slate-500">Minh chứng tham chiếu:</p>
                  {m.citations.map((c, idx) =>
                    c.evidenceId ? (
                      <Link
                        key={idx}
                        href={`/evidence/${c.evidenceId}`}
                        className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline"
                      >
                        <FileText className="h-3 w-3" /> [{idx + 1}] {c.evidenceCode} — {c.evidenceTitle}
                      </Link>
                    ) : null,
                  )}
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {pending && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <Sparkles className="h-4 w-4 animate-pulse" />
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-2.5 text-sm text-slate-500">Đang tra cứu kho minh chứng…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2 border-t border-slate-100 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập câu hỏi về hồ sơ kiểm định…"
          className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <Button type="submit" disabled={pending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
