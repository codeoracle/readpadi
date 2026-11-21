export type Role = "student" | "moderator" | "admin";
export interface Profile { id: string; email: string | null; name: string; school: string; programme: string; level: string; centre: string; session: string; role: Role; pro_until: string | null; referral_code?: string; show_on_board?: boolean }
export interface Course { id: string; code: string; title: string; school: string; description: string; pages: number; file_path: string; file_bytes: number; status: "pending" | "approved" | "rejected"; reject_reason: string; uploaded_by: string | null; created_at: string }
export interface Exam { course_id: string; exam_date: string; exam_time: string; mode: "cbt" | "pop"; venue: string; notes: string }
export interface Progress { course_id: string; seen: string; last_page: number }
export interface Note { id: string; course_id: string; label: string; body: string; page_from: number | null; page_to: number | null; created_at: string }
export type QType = "mcq" | "fib" | "theory";
export interface Question { id: string; type: QType; q: string; options?: string[]; answer: number | string; accept?: string[]; marks?: number; explanation: string; page: number | null; topic: string }
export interface MarkedItem extends Question { given: number | string | null; max: number; score: number; feedback: string }
export interface Attempt { id: string; course_id: string; kind: "cbt" | "mcq" | "fib" | "theory"; level: string; page_from: number; page_to: number; score: number; total: number; pct: number; secs: number; items: MarkedItem[]; ai_note: string; created_at: string }
export interface ClassStat { course_id: string; students: number; avg_best: number }
export interface AiStatus { used: number; limit: number; window_hours: number; resets_at: string | null; pro: boolean; pro_until: string | null }
export interface Plan { id: string; label: string; days: number; price_ngn: number }
export interface LockerItem { id: string; title: string; category: string; academic_year: string; semester: string; level: string; amount_ngn: number | null; doc_date: string | null; notes: string; file_path: string; file_bytes: number; mime: string; created_at: string }
