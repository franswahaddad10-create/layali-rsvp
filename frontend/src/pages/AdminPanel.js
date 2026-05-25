import React, { useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

const permissionOptions = [
  { key: 'manageUsers', label: 'Manage Users Permission' },
  { key: 'manageEvents', label: 'Manage Events Permission' },
  { key: 'manageGuests', label: 'Manage Guests Permission' },
  { key: 'assignGuests', label: 'Assign Guests Permission' },
  { key: 'editHallMap', label: 'Edit Hall Map Permission' },
  { key: 'manageMapLock', label: 'Manage Map Lock Permission' },
  { key: 'manageEntrance', label: 'Manage Entrance Permission' },
  { key: 'escortGuests', label: 'Escort Guests Permission' },
  { key: 'viewReports', label: 'View Reports Permission' },
];

const getDefaultPermissionsByRole = (role) => {
  if (role === 'admin') {
    return permissionOptions.reduce((permissions, option) => ({ ...permissions, [option.key]: true }), {});
  }

  if (role === 'escort') {
    return {
      manageUsers: false,
      manageEvents: false,
      manageGuests: false,
      assignGuests: true,
      editHallMap: false,
      manageMapLock: false,
      manageEntrance: true,
      escortGuests: true,
      viewReports: false,
    };
  }

  return {
    manageUsers: false,
    manageEvents: true,
    manageGuests: true,
    assignGuests: true,
    editHallMap: true,
    manageMapLock: false,
    manageEntrance: true,
    escortGuests: true,
    viewReports: true,
  };
};

function AdminPanel({ onLogout, user }) {
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'manager', permissions: getDefaultPermissionsByRole('manager') });
  const [passwordUpdates, setPasswordUpdates] = useState({});
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [visiblePasswordUpdates, setVisiblePasswordUpdates] = useState({});
  const [accessUpdates, setAccessUpdates] = useState({});

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authAPI.getUsers();
      const nextUsers = response.data.users || [];
      setUsers(nextUsers);
      setAccessUpdates(nextUsers.reduce((updates, teamMember) => {
        updates[teamMember._id] = {
          role: teamMember.role,
          permissions: { ...teamMember.permissions },
        };
        return updates;
      }, {}));
      setError('');
    } catch (err) {
      setError(t('Unable to fetch users. Please login again.'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleChange = (key, value) => {
    if (key === 'role') {
      setNewUser({ ...newUser, role: value, permissions: getDefaultPermissionsByRole(value) });
      return;
    }

    setNewUser({ ...newUser, [key]: value });
  };

  const handleNewUserPermissionChange = (permissionKey, checked) => {
    setNewUser({
      ...newUser,
      permissions: {
        ...newUser.permissions,
        [permissionKey]: checked,
      },
    });
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    try {
      await authAPI.createUser(newUser);
      setNewUser({ username: '', password: '', role: 'manager', permissions: getDefaultPermissionsByRole('manager') });
      fetchUsers();
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || t('Failed to create user.'));
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await authAPI.deleteUser(id);
      fetchUsers();
      setError('');
    } catch (err) {
      setError(t('Failed to delete user.'));
    }
  };

  const handleUpdatePassword = async (id) => {
    const password = passwordUpdates[id];
    if (!password) {
      setError(t('Provide a password to reset.'));
      return;
    }

    try {
      await authAPI.updateUser(id, { password });
      setPasswordUpdates({ ...passwordUpdates, [id]: '' });
      setError('');
    } catch (err) {
      setError(t('Failed to update password.'));
    }
  };

  const handleAccessChange = (id, key, value) => {
    setAccessUpdates({
      ...accessUpdates,
      [id]: {
        ...accessUpdates[id],
        [key]: value,
      },
    });
  };

  const handlePermissionChange = (id, permissionKey, checked) => {
    setAccessUpdates({
      ...accessUpdates,
      [id]: {
        ...accessUpdates[id],
        permissions: {
          ...accessUpdates[id]?.permissions,
          [permissionKey]: checked,
        },
      },
    });
  };

  const handleSaveAccess = async (id) => {
    try {
      await authAPI.updateUser(id, accessUpdates[id]);
      setError('');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || t('Failed to update access permissions.'));
    }
  };

  return (
    <div className="admin-console">
      <div className="admin-header">
        <div>
          <h2>{t('Worker Access Control')}</h2>
          <p>{t('Manage backend users and secure access for your team.')}</p>
        </div>
        <div className="admin-meta">
          <span>{t('Signed in as')} {user.username}</span>
          <button onClick={onLogout}>{t('Logout')}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="user-management">
        <h3>{t('Create a new worker account')}</h3>
        <form className="user-form" onSubmit={handleCreateUser}>
          <label>
            {t('Username')}
            <input value={newUser.username} onChange={(e) => handleChange('username', e.target.value)} placeholder="worker1" />
          </label>
          <label>
            {t('Password')}
            <div className="password-field">
              <input type={showNewUserPassword ? 'text' : 'password'} value={newUser.password} onChange={(e) => handleChange('password', e.target.value)} placeholder={t('secure password')} />
              <button type="button" className="password-toggle" onClick={() => setShowNewUserPassword((current) => !current)}>
                {showNewUserPassword ? t('Hide Password') : t('Show Password')}
              </button>
            </div>
          </label>
          <p className="password-helper full-width">{t('Password requirement helper')}</p>
          <label>
            {t('Role')}
            <select value={newUser.role} onChange={(e) => handleChange('role', e.target.value)}>
              <option value="manager">{t('Manager')}</option>
              <option value="escort">{t('Escort Team')}</option>
              <option value="admin">{t('Admin')}</option>
            </select>
          </label>
          <div className="permission-grid full-width">
            {permissionOptions.map((option) => (
              <label key={option.key} className="permission-checkbox">
                <input type="checkbox" checked={Boolean(newUser.permissions?.[option.key])} onChange={(e) => handleNewUserPermissionChange(option.key, e.target.checked)} />
                <span>{t(option.label)}</span>
              </label>
            ))}
          </div>
          <button type="submit">{t('Create worker')}</button>
        </form>
      </section>

      <section className="user-table">
        <h3>{t('Existing backend users')}</h3>
        {loading ? (
          <p>{t('Loading users...')}</p>
        ) : (
          <div className="users-grid">
            {users.map((teamMember) => (
              <div key={teamMember._id} className="user-card">
                <div>
                  <h4>{teamMember.username}</h4>
                  <p>{teamMember.role}</p>
                </div>
                <div className="user-actions">
                  <select value={accessUpdates[teamMember._id]?.role || teamMember.role} onChange={(e) => handleAccessChange(teamMember._id, 'role', e.target.value)}>
                    <option value="manager">{t('Manager')}</option>
                    <option value="escort">{t('Escort Team')}</option>
                    <option value="admin">{t('Admin')}</option>
                  </select>
                  <div className="permission-grid">
                    {permissionOptions.map((option) => (
                      <label key={option.key} className="permission-checkbox">
                        <input type="checkbox" checked={Boolean(accessUpdates[teamMember._id]?.permissions?.[option.key])} onChange={(e) => handlePermissionChange(teamMember._id, option.key, e.target.checked)} />
                        <span>{t(option.label)}</span>
                      </label>
                    ))}
                  </div>
                  <button onClick={() => handleSaveAccess(teamMember._id)}>{t('Save access permissions')}</button>
                  <div className="password-field">
                    <input
                      type={visiblePasswordUpdates[teamMember._id] ? 'text' : 'password'}
                      value={passwordUpdates[teamMember._id] || ''}
                      onChange={(e) => setPasswordUpdates({ ...passwordUpdates, [teamMember._id]: e.target.value })}
                      placeholder={t('New password')}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setVisiblePasswordUpdates({
                        ...visiblePasswordUpdates,
                        [teamMember._id]: !visiblePasswordUpdates[teamMember._id],
                      })}
                    >
                      {visiblePasswordUpdates[teamMember._id] ? t('Hide Password') : t('Show Password')}
                    </button>
                  </div>
                  <p className="password-helper">{t('Password requirement helper')}</p>
                  <button onClick={() => handleUpdatePassword(teamMember._id)}>{t('Reset password')}</button>
                  <button className="danger" onClick={() => handleDeleteUser(teamMember._id)}>{t('Remove')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminPanel;
