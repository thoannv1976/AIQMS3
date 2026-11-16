"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/app/(app)/notifications/actions";

export interface NotificationItem {
  id: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell({ items: initial }: { items: NotificationItem[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const unread = items.filter((i) => !i.read).length;

  function markRead(id: string) {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read: true } : x)));
    start(() => void markNotificationReadAction(id));
  }
  function markAll() {
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    start(() => void markAllNotificationsReadAction());
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        title="Thông báo"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-sm font-semibold text-slate-700">Thông báo</span>
              {unread > 0 && (
                <button onClick={markAll} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
                  <Check className="h-3.5 w-3.5" /> Đánh dấu đã đọc
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">Không có thông báo.</p>
              ) : (
                items.map((n) => {
                  const body = (
                    <div className={`px-3 py-2.5 hover:bg-slate-50 ${n.read ? "" : "bg-brand-50/40"}`}>
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800">{n.title}</div>
                          {n.message && <div className="text-xs text-slate-500">{n.message}</div>}
                          <div className="mt-0.5 text-[11px] text-slate-400">{formatDate(n.createdAt)}</div>
                        </div>
                      </div>
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => { markRead(n.id); setOpen(false); }}>
                      {body}
                    </Link>
                  ) : (
                    <button key={n.id} onClick={() => markRead(n.id)} className="block w-full text-left">
                      {body}
                    </button>
                  );
                })
              )}
            </div>

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-slate-100 px-3 py-2 text-center text-xs font-medium text-brand-600 hover:bg-slate-50"
            >
              Xem tất cả
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
