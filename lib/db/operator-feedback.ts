import 'server-only';

import { createClient } from '@supabase/supabase-js';

export interface ReservationOperatorFeedback {
  id: string;
  reservation_id: string;
  operator_user_id: string;
  commuter_name: string | null;
  commuter_email: string | null;
  rating: number;
  feedback: string | null;
  created_at: string;
}

export interface TrustedOperatorRating {
  operator_user_id: string;
  operator_name: string;
  operator_email: string;
  operator_avatar_url: string;
  average_rating: number;
  review_count: number;
  trusted: boolean;
  recent_comments: Array<{
    id: string;
    commuter_name: string | null;
    rating: number;
    feedback: string;
    created_at: string;
  }>;
}

export interface OperatorRatingSummary {
  average_rating: number;
  review_count: number;
  trusted: boolean;
  recent_feedback: Array<{
    id: string;
    reservation_id: string;
    rating: number;
    feedback: string | null;
    commuter_name: string | null;
    created_at: string;
  }>;
}

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service env is missing.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const isMissingTableError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  const code = String(err.code || '').toUpperCase();
  const message = String(err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find the table')
  );
};

const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export async function getReservationOperatorFeedback(reservationId: string) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('tbl_operator_feedback')
    .select(
      'id, reservation_id, operator_user_id, commuter_name, commuter_email, rating, feedback, created_at'
    )
    .eq('reservation_id', reservationId)
    .limit(1);

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message || 'Failed to load reservation feedback.');
  }

  return ((data?.[0] || null) as ReservationOperatorFeedback | null) || null;
}

export async function createReservationOperatorFeedback(input: {
  reservationId: string;
  operatorUserId: string;
  commuterName?: string | null;
  commuterEmail?: string | null;
  rating: number;
  feedback?: string | null;
}) {
  const supabase = getServiceClient();

  const sanitizedFeedback = String(input.feedback || '').trim();
  const payload = {
    reservation_id: input.reservationId,
    operator_user_id: input.operatorUserId,
    commuter_name: (input.commuterName || '').trim() || null,
    commuter_email: String(input.commuterEmail || '').trim().toLowerCase() || null,
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    feedback: sanitizedFeedback || null,
  };

  const { data, error } = await supabase
    .from('tbl_operator_feedback')
    .insert(payload)
    .select(
      'id, reservation_id, operator_user_id, commuter_name, commuter_email, rating, feedback, created_at'
    )
    .limit(1);

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error('Rating feature is not configured yet.');
    }
    const code = String((error as { code?: string })?.code || '');
    if (code === '23505') {
      throw new Error('This reservation is already rated.');
    }
    throw new Error(error.message || 'Failed to save operator rating.');
  }

  const row = data?.[0] as ReservationOperatorFeedback | undefined;
  if (!row) {
    throw new Error('Failed to save operator rating.');
  }
  return row;
}

export async function listTrustedOperatorRatings(
  limit = 4,
  options?: { trustedOnly?: boolean }
) {
  const supabase = getServiceClient();

  const { data: feedbackRows, error: feedbackError } = await supabase
    .from('tbl_operator_feedback')
    .select('id, operator_user_id, commuter_name, rating, feedback, created_at')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (feedbackError) {
    if (isMissingTableError(feedbackError)) return [] as TrustedOperatorRating[];
    throw new Error(feedbackError.message || 'Failed to load operator ratings.');
  }

  const statsByOperator = new Map<
    string,
    { sum: number; count: number; latestAt: string }
  >();
  const commentsByOperator = new Map<
    string,
    Array<{
      id: string;
      commuter_name: string | null;
      rating: number;
      feedback: string;
      created_at: string;
    }>
  >();
  for (const row of feedbackRows || []) {
    const operatorUserId = String(row.operator_user_id || '').trim();
    if (!operatorUserId) continue;
    const existing = statsByOperator.get(operatorUserId) || {
      sum: 0,
      count: 0,
      latestAt: '',
    };
    existing.sum += toNumber(row.rating, 0);
    existing.count += 1;
    if (!existing.latestAt || String(row.created_at || '') > existing.latestAt) {
      existing.latestAt = String(row.created_at || '');
    }
    statsByOperator.set(operatorUserId, existing);

    const feedbackText = String(row.feedback || '').trim();
    if (feedbackText) {
      const comments = commentsByOperator.get(operatorUserId) || [];
      comments.push({
        id: String(row.id || ''),
        commuter_name: row.commuter_name || null,
        rating: toNumber(row.rating, 0),
        feedback: feedbackText,
        created_at: String(row.created_at || ''),
      });
      commentsByOperator.set(operatorUserId, comments);
    }
  }

  if (statsByOperator.size === 0) return [] as TrustedOperatorRating[];

  const candidateRows = Array.from(statsByOperator.entries())
    .map(([operatorUserId, metric]) => {
      const average = metric.count > 0 ? metric.sum / metric.count : 0;
      return {
        operatorUserId,
        averageRating: Number(average.toFixed(2)),
        reviewCount: metric.count,
        latestAt: metric.latestAt,
        trusted: average >= 4.2 && metric.count >= 3,
      };
    })
    .sort((a, b) => {
      if (b.averageRating !== a.averageRating) {
        return b.averageRating - a.averageRating;
      }
      if (b.reviewCount !== a.reviewCount) {
        return b.reviewCount - a.reviewCount;
      }
      return String(b.latestAt).localeCompare(String(a.latestAt));
    });

  const operatorIds = candidateRows.map((row) => row.operatorUserId);

  const { data: userRows, error: userError } = await supabase
    .from('tbl_users')
    .select('user_id, full_name, email, avatar_url')
    .in('user_id', operatorIds);
  if (userError) {
    throw new Error(userError.message || 'Failed to load operator names.');
  }
  const usersById = new Map(
    (userRows || []).map((row) => [
      String(row.user_id || ''),
      {
        full_name: String(row.full_name || '').trim(),
        email: String(row.email || '').trim(),
        avatar_url: String((row as { avatar_url?: string | null }).avatar_url || '').trim(),
      },
    ])
  );

  const { data: appRows, error: appError } = await supabase
    .from('tbl_operator_applications')
    .select('user_id, full_name, email, status, created_at')
    .eq('status', 'approved')
    .in('user_id', operatorIds)
    .order('created_at', { ascending: false });
  if (appError) {
    throw new Error(appError.message || 'Failed to load approved operator data.');
  }
  const approvedAppsByUserId = new Map<string, { full_name: string; email: string }>();
  for (const row of appRows || []) {
    const userId = String(row.user_id || '').trim();
    if (!userId || approvedAppsByUserId.has(userId)) continue;
    approvedAppsByUserId.set(userId, {
      full_name: String(row.full_name || '').trim(),
      email: String(row.email || '').trim(),
    });
  }

  const mapped = candidateRows
    .filter((row) => approvedAppsByUserId.has(row.operatorUserId))
    .map((row) => {
      const app = approvedAppsByUserId.get(row.operatorUserId);
      const user = usersById.get(row.operatorUserId);
      return {
        operator_user_id: row.operatorUserId,
        operator_name:
          app?.full_name ||
          user?.full_name ||
          'Operator',
        operator_email:
          app?.email ||
          user?.email ||
          '',
        operator_avatar_url: user?.avatar_url || '',
        average_rating: row.averageRating,
        review_count: row.reviewCount,
        trusted: row.trusted,
        recent_comments: (commentsByOperator.get(row.operatorUserId) || [])
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, 12),
      };
    });

  const trustedOnly = !!options?.trustedOnly;
  const trustedFirst = mapped.filter((row) => row.trusted);
  if (trustedOnly) {
    return trustedFirst.slice(0, Math.max(1, limit));
  }

  const fallbackRows = mapped.filter((row) => !row.trusted);
  return [...trustedFirst, ...fallbackRows].slice(0, Math.max(1, limit));
}

export async function getOperatorRatingSummary(
  operatorUserId: string,
  recentLimit = 5
): Promise<OperatorRatingSummary> {
  const supabase = getServiceClient();
  const normalizedOperatorUserId = String(operatorUserId || '').trim();
  if (!normalizedOperatorUserId) {
    return {
      average_rating: 0,
      review_count: 0,
      trusted: false,
      recent_feedback: [],
    };
  }

  const { data, error } = await supabase
    .from('tbl_operator_feedback')
    .select(
      'id, reservation_id, rating, feedback, commuter_name, created_at'
    )
    .eq('operator_user_id', normalizedOperatorUserId)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    if (isMissingTableError(error)) {
      return {
        average_rating: 0,
        review_count: 0,
        trusted: false,
        recent_feedback: [],
      };
    }
    throw new Error(error.message || 'Failed to load operator rating summary.');
  }

  const rows = (data || []) as Array<{
    id: string;
    reservation_id: string;
    rating: number;
    feedback: string | null;
    commuter_name: string | null;
    created_at: string;
  }>;
  const reviewCount = rows.length;
  const sum = rows.reduce((acc, row) => acc + toNumber(row.rating, 0), 0);
  const average = reviewCount > 0 ? sum / reviewCount : 0;
  const trusted = reviewCount >= 3 && average >= 4.2;

  return {
    average_rating: Number(average.toFixed(2)),
    review_count: reviewCount,
    trusted,
    recent_feedback: rows.slice(0, Math.max(1, recentLimit)),
  };
}
