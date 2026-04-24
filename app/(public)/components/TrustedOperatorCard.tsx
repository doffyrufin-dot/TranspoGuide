'use client';

import { useEffect, useMemo, useState } from 'react';
import { FaStar } from 'react-icons/fa';

type OperatorRecentComment = {
  id: string;
  commuter_name: string | null;
  rating: number;
  feedback: string;
  created_at: string;
};

export type TrustedOperatorCardOperator = {
  operator_user_id: string;
  operator_name: string;
  operator_email: string;
  operator_avatar_url: string;
  average_rating: number;
  review_count: number;
  trusted: boolean;
  recent_comments: OperatorRecentComment[];
};

type TrustedOperatorCardProps = {
  operator: TrustedOperatorCardOperator;
  isCommentsOpen?: boolean;
  onToggleComments?: () => void;
};

const COMMENTS_PER_PAGE = 3;

const getInitials = (name: string) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'OP';
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || '';
  return `${first}${second}`.toUpperCase();
};

export default function TrustedOperatorCard({
  operator,
  isCommentsOpen: controlledOpen,
  onToggleComments,
}: TrustedOperatorCardProps) {
  const totalCommentPages = Math.max(
    1,
    Math.ceil(operator.recent_comments.length / COMMENTS_PER_PAGE)
  );
  const [commentPage, setCommentPage] = useState(1);
  const [isCommentsOpenLocal, setIsCommentsOpenLocal] = useState(false);
  const isCommentsOpen = controlledOpen ?? isCommentsOpenLocal;

  const toggleComments = () => {
    if (onToggleComments) {
      onToggleComments();
      return;
    }
    setIsCommentsOpenLocal((prev) => !prev);
  };

  useEffect(() => {
    setCommentPage(1);
    if (typeof controlledOpen !== 'boolean') {
      setIsCommentsOpenLocal(false);
    }
  }, [operator.operator_user_id, operator.operator_email, controlledOpen]);

  const pagedComments = useMemo(() => {
    const safePage = Math.min(Math.max(1, commentPage), totalCommentPages);
    const from = (safePage - 1) * COMMENTS_PER_PAGE;
    return operator.recent_comments.slice(from, from + COMMENTS_PER_PAGE);
  }, [commentPage, totalCommentPages, operator.recent_comments]);

  return (
    <div className="card-glow rounded-2xl p-6 self-start">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold"
            style={{
              background: 'var(--tg-subtle)',
              border: '1px solid var(--tg-border)',
              color: 'var(--primary)',
            }}
          >
            {operator.operator_avatar_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={operator.operator_avatar_url}
                  alt={operator.operator_name}
                  className="w-full h-full object-cover"
                />
              </>
            ) : (
              getInitials(operator.operator_name)
            )}
          </div>
          <div className="min-w-0">
            <p className="text-theme font-bold leading-tight truncate">
              {operator.operator_name}
            </p>
            <p className="text-xs text-muted-theme mt-1 truncate">
              {operator.operator_email || 'Operator'}
            </p>
          </div>
        </div>
        {operator.trusted && (
          <span className="step-badge text-[11px]">Trusted</span>
        )}
      </div>
      <div className="mt-4 flex items-center gap-1">
        {Array.from({ length: 5 }, (_, idx) => {
          const active = idx < Math.round(Number(operator.average_rating || 0));
          return (
            <FaStar
              key={`${operator.operator_user_id}-star-${idx + 1}`}
              size={13}
              style={{
                color: active ? '#f59e0b' : 'var(--tg-border)',
              }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-sm text-theme font-semibold">
        {Number(operator.average_rating || 0).toFixed(1)} / 5
      </p>
      <p className="text-xs text-muted-theme">
        {operator.review_count} commuter review
        {operator.review_count === 1 ? '' : 's'}
      </p>
      <div className="mt-3 rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg-alt)] overflow-hidden">
        <button
          type="button"
          onClick={toggleComments}
          className="w-full px-3 py-2 text-left text-xs font-semibold text-theme cursor-pointer select-none flex items-center justify-between"
          aria-expanded={isCommentsOpen}
        >
          <span>Recent Comments ({operator.recent_comments.length})</span>
          <span className="text-[11px] text-muted-theme">
            {isCommentsOpen ? 'Hide' : 'Show'}
          </span>
        </button>

        {isCommentsOpen && (
          <div className="px-3 pb-3 space-y-2">
            {operator.recent_comments.length === 0 ? (
              <p className="text-xs text-muted-theme">No feedback comments yet.</p>
            ) : (
              <>
                {pagedComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-lg p-2"
                    style={{
                      background: 'var(--tg-card)',
                      border: '1px solid var(--tg-border)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-theme truncate">
                        {comment.commuter_name || 'Commuter'}
                      </p>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, idx) => {
                          const active = idx < Number(comment.rating || 0);
                          return (
                            <FaStar
                              key={`${comment.id}-comment-star-${idx + 1}`}
                              size={10}
                              style={{
                                color: active ? '#f59e0b' : 'var(--tg-border)',
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-theme mt-1 leading-relaxed">
                      {comment.feedback}
                    </p>
                  </div>
                ))}

                {operator.recent_comments.length > COMMENTS_PER_PAGE && (
                  <div className="pt-1 flex items-center justify-between">
                    <p className="text-[11px] text-muted-theme">
                      Page {commentPage} of {totalCommentPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCommentPage((prev) => Math.max(1, prev - 1))}
                        disabled={commentPage <= 1}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                        style={{
                          background: 'var(--tg-subtle)',
                          color: 'var(--primary)',
                          border: '1px solid var(--tg-border-primary)',
                        }}
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCommentPage((prev) =>
                            Math.min(totalCommentPages, prev + 1)
                          )
                        }
                        disabled={commentPage >= totalCommentPages}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                        style={{
                          background: 'var(--tg-subtle)',
                          color: 'var(--primary)',
                          border: '1px solid var(--tg-border-primary)',
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
