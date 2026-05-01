import { NextRequest, NextResponse } from 'next/server';
import { requireAdminServiceClient } from '@/lib/server/admin-auth';

const toStatus = (message: string) => {
  if (message === 'missing_auth_token' || message === 'unauthorized') return 401;
  if (message === 'forbidden') return 403;
  if (message === 'server_env_missing') return 500;
  if (message === 'not_found') return 404;
  return 400;
};

export async function GET(req: NextRequest) {
  try {
    const { serviceClient: supabase } = await requireAdminServiceClient(req);

    const { data: appRows, error: appError } = await supabase
      .from('tbl_operator_applications')
      .select(
        'id, user_id, full_name, email, contact_number, address, plate_number, vehicle_model, seating_capacity, drivers_license_url, vehicle_registration_url, franchise_cert_url, admin_notes, status, created_at'
      )
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(500);

    if (appError) {
      throw new Error(appError.message || 'Failed to load operators.');
    }

    const operators = (appRows || []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id || null,
      name: row.full_name || 'Operator',
      email: row.email || '',
      contact: row.contact_number || '',
      address: row.address || '',
      plate_number: row.plate_number || 'N/A',
      vehicle_model: row.vehicle_model || 'Van',
      seating_capacity: Number(row.seating_capacity || 0),
      drivers_license_url: row.drivers_license_url || null,
      vehicle_registration_url: row.vehicle_registration_url || null,
      franchise_cert_url: row.franchise_cert_url || null,
      admin_notes: row.admin_notes || null,
      status: row.status || 'approved',
      approved_at: row.created_at || null,
    }));

    return NextResponse.json(
      { operators },
      {
        headers: {
          'Cache-Control': 'private, max-age=20, stale-while-revalidate=40',
        },
      }
    );
  } catch (error: any) {
    const message = error?.message || 'Failed to load approved operators.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { serviceClient: supabase } = await requireAdminServiceClient(req);
    const payload = (await req.json().catch(() => ({}))) as {
      applicationId?: string;
      reason?: string;
    };

    const applicationId = String(payload.applicationId || '').trim();
    const reason = String(payload.reason || '').trim();

    if (!applicationId) {
      throw new Error('application_id_required');
    }

    const { data: rows, error: readError } = await supabase
      .from('tbl_operator_applications')
      .select('id, user_id, status, admin_notes')
      .eq('id', applicationId)
      .limit(1);

    if (readError) {
      throw new Error(readError.message || 'Failed to load operator record.');
    }

    const row = rows?.[0] as
      | {
          id?: string;
          user_id?: string | null;
          status?: string | null;
          admin_notes?: string | null;
        }
      | undefined;
    if (!row?.id) {
      throw new Error('not_found');
    }

    const normalizedStatus = String(row.status || '')
      .trim()
      .toLowerCase();

    if (normalizedStatus === 'rejected') {
      return NextResponse.json({
        success: true,
        alreadyRemoved: true,
      });
    }

    const noteLine = `Soft deleted by admin (${new Date().toISOString()})${
      reason ? `: ${reason}` : ''
    }`;
    const mergedNotes = [String(row.admin_notes || '').trim(), noteLine]
      .filter(Boolean)
      .join('\n');

    const { error: updateError } = await supabase
      .from('tbl_operator_applications')
      .update({
        status: 'rejected',
        admin_notes: mergedNotes,
      })
      .eq('id', applicationId);
    if (updateError) {
      throw new Error(updateError.message || 'Failed to remove driver.');
    }

    const userId = String(row.user_id || '').trim();
    if (userId) {
      const { error: queueError } = await supabase
        .from('tbl_van_queue')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('operator_user_id', userId)
        .in('status', ['queued', 'boarding']);
      if (queueError) {
        console.warn('Failed to cancel active queue after soft delete:', queueError);
      }
    }

    return NextResponse.json({
      success: true,
      applicationId,
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to remove driver.';
    return NextResponse.json({ error: message }, { status: toStatus(message) });
  }
}
