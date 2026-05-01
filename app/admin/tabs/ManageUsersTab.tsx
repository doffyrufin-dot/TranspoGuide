'use client';

import React, { useMemo, useState } from 'react';
import sileoToast from '@/lib/utils/sileo-toast';
import { Lock, Pencil, RotateCcw, Save, Trash2, Unlock, X } from 'lucide-react';

type UserRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'operator' | string;
  created_at: string | null;
  security?: {
    failed_count: number;
    locked_until: string | null;
    last_failed_at: string | null;
    is_locked: boolean;
  };
};

type RoleFilter = 'all' | 'admin' | 'operator';

export default function ManageUsersTab({ accessToken }: { accessToken: string }) {
  const [loading, setLoading] = React.useState(true);
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [editingId, setEditingId] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'operator'>('operator');
  const [savingId, setSavingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [securityBusyId, setSecurityBusyId] = useState('');

  const loadUsers = React.useCallback(
    async (silent = false) => {
      if (!accessToken) return;
      try {
        if (!silent) setLoading(true);
        const res = await fetch('/api/admin/users', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load users.');
        }
        setUsers(Array.isArray(data?.users) ? data.users : []);
      } catch (error: any) {
        sileoToast.error({
          title: 'Failed to load users',
          description: error?.message || 'Please try again.',
        });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [accessToken]
  );

  React.useEffect(() => {
    void loadUsers(false);
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (!normalizedSearch) return true;
      const fullName = String(user.full_name || '').toLowerCase();
      const email = String(user.email || '').toLowerCase();
      const userId = String(user.user_id || '').toLowerCase();
      return (
        fullName.includes(normalizedSearch) ||
        email.includes(normalizedSearch) ||
        userId.includes(normalizedSearch)
      );
    });
  }, [users, search, roleFilter]);

  const startEdit = (user: UserRow) => {
    setEditingId(user.id);
    setEditFullName(String(user.full_name || ''));
    setEditRole(user.role === 'admin' ? 'admin' : 'operator');
  };

  const cancelEdit = () => {
    setEditingId('');
    setEditFullName('');
    setEditRole('operator');
  };

  const saveEdit = async (id: string) => {
    if (!accessToken || savingId) return;
    try {
      setSavingId(id);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          full_name: editFullName.trim() || null,
          role: editRole,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update user.');
      }
      setUsers((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                full_name: editFullName.trim() || null,
                role: editRole,
              }
            : item
        )
      );
      sileoToast.success({ title: 'User updated' });
      cancelEdit();
    } catch (error: any) {
      const message = String(error?.message || '');
      sileoToast.error({
        title: 'Update failed',
        description:
          message === 'cannot_update_self_role'
            ? 'You cannot change your own role from admin.'
            : error?.message || 'Please try again.',
      });
    } finally {
      setSavingId('');
    }
  };

  const deleteUser = async (user: UserRow) => {
    if (!accessToken || deletingId) return;
    const confirmed = window.confirm(
      `Remove this user from app access?\n\n${user.full_name || user.email}\n${user.email}`
    );
    if (!confirmed) return;

    try {
      setDeletingId(user.id);
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: user.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to remove user.');
      }
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
      sileoToast.success({ title: 'User removed' });
    } catch (error: any) {
      const message = String(error?.message || '');
      sileoToast.error({
        title: 'Remove failed',
        description:
          message === 'cannot_delete_self'
            ? 'You cannot remove your own account.'
            : message === 'last_admin_guard'
              ? 'Cannot remove the last admin user.'
              : error?.message || 'Please try again.',
      });
    } finally {
      setDeletingId('');
    }
  };

  const applySecurityAction = async (
    user: UserRow,
    action: 'unlock' | 'lock_15m' | 'reset_attempts'
  ) => {
    if (!accessToken || securityBusyId) return;
    const busyKey = `${user.id}:${action}`;
    try {
      setSecurityBusyId(busyKey);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: user.id,
          security_action: action,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to update account security.');
      }

      setUsers((prev) =>
        prev.map((item) => {
          if (item.id !== user.id) return item;
          const currentSecurity = item.security || {
            failed_count: 0,
            locked_until: null,
            last_failed_at: null,
            is_locked: false,
          };
          if (action === 'lock_15m') {
            const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            return {
              ...item,
              security: {
                ...currentSecurity,
                failed_count: Math.max(1, Number(currentSecurity.failed_count || 0)),
                locked_until: lockUntil,
                is_locked: true,
              },
            };
          }
          return {
            ...item,
            security: {
              ...currentSecurity,
              failed_count: 0,
              locked_until: null,
              is_locked: false,
            },
          };
        })
      );

      sileoToast.success({
        title:
          action === 'lock_15m'
            ? 'Account locked for 15 minutes'
            : action === 'unlock'
              ? 'Account unlocked'
              : 'Failed attempts reset',
      });
    } catch (error: any) {
      sileoToast.error({
        title: 'Security update failed',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setSecurityBusyId('');
    }
  };

  return (
    <div className="admin-tab space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-theme">Manage Users</h1>
          <p className="text-muted-theme text-sm">
            View users, manage roles, and control account security lockouts.
          </p>
        </div>
        <button
          onClick={() => void loadUsers(false)}
          className="btn-primary text-sm"
          disabled={loading}
        >
          Refresh Users
        </button>
      </div>

      <div className="card-glow rounded-2xl p-4 md:p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className="input-dark md:col-span-2"
            placeholder="Search name, email, or user id..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input-dark"
            value={roleFilter}
            onChange={(e) =>
              setRoleFilter((e.target.value as RoleFilter) || 'all')
            }
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
          </select>
        </div>
      </div>

      <div className="card-glow rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--tg-border)' }}>
              <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                Name
              </th>
              <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                Email
              </th>
              <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                Role
              </th>
              <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                Account Security
              </th>
              <th className="text-left p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                Created
              </th>
              <th className="text-right p-4 text-muted-theme font-semibold text-xs uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-muted-theme" colSpan={6}>
                  Loading users...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td className="p-4 text-muted-theme" colSpan={6}>
                  No users found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isEditing = editingId === user.id;
                const createdLabel = user.created_at
                  ? new Date(user.created_at).toLocaleString('en-PH')
                  : '--';
                const security = user.security || {
                  failed_count: 0,
                  locked_until: null,
                  last_failed_at: null,
                  is_locked: false,
                };
                const lockedUntilLabel = security.locked_until
                  ? new Date(security.locked_until).toLocaleString('en-PH')
                  : '--';
                return (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--tg-border)' }}>
                    <td className="p-4 text-theme">
                      {isEditing ? (
                        <input
                          className="input-dark"
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                          placeholder="Full name"
                        />
                      ) : (
                        <div>
                          <p className="font-semibold">{user.full_name || 'No name'}</p>
                          <p className="text-xs text-muted-theme font-mono">
                            {user.user_id || '--'}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-theme">{user.email || '--'}</td>
                    <td className="p-4 text-theme">
                      {isEditing ? (
                        <select
                          className="input-dark"
                          value={editRole}
                          onChange={(e) =>
                            setEditRole(
                              e.target.value === 'admin' ? 'admin' : 'operator'
                            )
                          }
                        >
                          <option value="operator">Operator</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span
                          className="px-2 py-1 rounded-md text-xs font-semibold uppercase"
                          style={{
                            background:
                              user.role === 'admin'
                                ? 'rgba(34,197,94,0.15)'
                                : 'rgba(37,151,233,0.15)',
                            color: user.role === 'admin' ? '#22c55e' : 'var(--primary)',
                          }}
                        >
                          {user.role}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-theme">
                      <div className="space-y-1">
                        <p className="text-xs">
                          Status:{' '}
                          <span
                            className="font-semibold"
                            style={{ color: security.is_locked ? '#ef4444' : '#22c55e' }}
                          >
                            {security.is_locked ? 'Locked' : 'Active'}
                          </span>
                        </p>
                        <p className="text-xs text-muted-theme">
                          Failed attempts: {Number(security.failed_count || 0)}
                        </p>
                        <p className="text-xs text-muted-theme">
                          Locked until: {lockedUntilLabel}
                        </p>
                      </div>
                    </td>
                    <td className="p-4 text-muted-theme">{createdLabel}</td>
                    <td className="p-4 text-right">
                      <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => void saveEdit(user.id)}
                              disabled={savingId === user.id}
                              className="p-1.5 rounded-md cursor-pointer disabled:opacity-60"
                              style={{
                                color: '#22c55e',
                                background: 'var(--tg-subtle)',
                                border: '1px solid var(--tg-border)',
                              }}
                              title="Save"
                              aria-label="Save"
                            >
                              <Save size={13} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 rounded-md cursor-pointer"
                              style={{
                                color: 'var(--tg-muted)',
                                background: 'var(--tg-subtle)',
                                border: '1px solid var(--tg-border)',
                              }}
                              title="Cancel"
                              aria-label="Cancel"
                            >
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => void applySecurityAction(user, 'lock_15m')}
                              disabled={securityBusyId !== ''}
                              className="p-1.5 rounded-md cursor-pointer disabled:opacity-60"
                              style={{
                                color: '#f59e0b',
                                background: 'var(--tg-subtle)',
                                border: '1px solid var(--tg-border)',
                              }}
                              title="Lock for 15 minutes"
                              aria-label="Lock for 15 minutes"
                            >
                              <Lock size={13} />
                            </button>
                            <button
                              onClick={() => void applySecurityAction(user, 'unlock')}
                              disabled={securityBusyId !== ''}
                              className="p-1.5 rounded-md cursor-pointer disabled:opacity-60"
                              style={{
                                color: '#22c55e',
                                background: 'var(--tg-subtle)',
                                border: '1px solid var(--tg-border)',
                              }}
                              title="Unlock account"
                              aria-label="Unlock account"
                            >
                              <Unlock size={13} />
                            </button>
                            <button
                              onClick={() =>
                                void applySecurityAction(user, 'reset_attempts')
                              }
                              disabled={securityBusyId !== ''}
                              className="p-1.5 rounded-md cursor-pointer disabled:opacity-60"
                              style={{
                                color: 'var(--primary)',
                                background: 'var(--tg-subtle)',
                                border: '1px solid var(--tg-border)',
                              }}
                              title="Reset failed attempts"
                              aria-label="Reset failed attempts"
                            >
                              <RotateCcw size={13} />
                            </button>
                            <button
                              onClick={() => startEdit(user)}
                              className="p-1.5 rounded-md cursor-pointer"
                              style={{
                                color: 'var(--primary)',
                                background: 'var(--tg-subtle)',
                                border: '1px solid var(--tg-border)',
                              }}
                              title="Edit user"
                              aria-label="Edit user"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => void deleteUser(user)}
                              disabled={deletingId === user.id}
                              className="p-1.5 rounded-md cursor-pointer disabled:opacity-60"
                              style={{
                                color: '#ef4444',
                                background: 'var(--tg-subtle)',
                                border: '1px solid var(--tg-border)',
                              }}
                              title="Remove user"
                              aria-label="Remove user"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
