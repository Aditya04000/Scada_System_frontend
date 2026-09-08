import React, { useCallback, useEffect, useState } from 'react';
import {
  getRegisteredUsers,
  updateUserPassword,
  updateUserRole,
  deleteUserAccount,
  registerUser,
  exportCredentialsFileText,
  checkPasswordPolicy,
  PASSWORD_MIN_LENGTH,
} from '../data/userCredentials';
import { UserRole, UserAccount } from '../types';
import { errorMessage } from '../services/api';
import {
  ShieldCheck,
  Key,
  UserPlus,
  Trash2,
  Save,
  Download,
  Copy,
  Check,
  FileCode,
  Lock,
  User,
  Mail,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export const AdminCredentialsView: React.FC = () => {
  // Accounts now arrive from GET /api/users, so this starts empty and fills in.
  // The previous version could initialise from localStorage synchronously; a
  // server round-trip cannot, which is the only structural difference here.
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loadError, setLoadError] = useState('');

  // Password editing state per user email
  const [editingPasswords, setEditingPasswords] = useState<Record<string, string>>({});
  const [passFeedback, setPassFeedback] = useState<{ email: string; msg: string; isError?: boolean } | null>(null);

  // New user registration form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('OPERATOR');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // File preview & export state
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [copiedFileText, setCopiedFileText] = useState(false);
  const [fileTextData, setFileTextData] = useState('');

  const refreshUsers = useCallback(async () => {
    try {
      setUsers(await getRegisteredUsers());
      setLoadError('');
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  /**
   * Fetches the account inventory text. Requested on demand rather than on mount
   * so opening this screen does not pull a report nobody asked to see.
   */
  const loadFileText = useCallback(async (): Promise<string> => {
    try {
      const text = await exportCredentialsFileText();
      setFileTextData(text);
      return text;
    } catch (err) {
      const message = `Could not load the account inventory: ${errorMessage(err)}`;
      setFileTextData(message);
      return message;
    }
  }, []);

  useEffect(() => {
    if (showFilePreview && !fileTextData) void loadFileText();
  }, [showFilePreview, fileTextData, loadFileText]);

  const handlePasswordChangeSubmit = async (usr: UserAccount) => {
    const email = usr.email;
    const newPass = (editingPasswords[email] || '').trim();

    // Checked here for an instant answer; the server validates it again and has
    // the final say, including a banned-password list this cannot reproduce.
    const policyProblem = checkPasswordPolicy(newPass);
    if (policyProblem) {
      setPassFeedback({ email, msg: policyProblem, isError: true });
      return;
    }

    const res = await updateUserPassword(usr.id, newPass);
    if (res.success) {
      setPassFeedback({
        email,
        msg: 'Password updated. That account has been signed out everywhere.',
        isError: false,
      });
      setEditingPasswords((prev) => ({ ...prev, [email]: '' }));
      // Refresh so the "password set" timestamp in the export stays honest.
      await refreshUsers();
      setTimeout(() => setPassFeedback(null), 3000);
      setFileTextData('');
    } else {
      setPassFeedback({
        email,
        msg: res.error || 'Failed to update password.',
        isError: true,
      });
    }
  };

  const handleRoleToggle = async (usr: UserAccount) => {
    const targetRole: UserRole = usr.role === 'ADMIN' ? 'OPERATOR' : 'ADMIN';
    const res = await updateUserRole(usr.id, targetRole);
    if (res.success) {
      await refreshUsers();
      setFileTextData('');
    } else {
      // The server refuses to demote the last active admin, and that reason is
      // worth reading — otherwise the toggle just appears not to work.
      setPassFeedback({ email: usr.email, msg: res.error || 'Could not change role.', isError: true });
    }
  };

  const handleDeleteUser = async (usr: UserAccount) => {
    if (window.confirm(`Are you sure you want to delete user account "${usr.email}" from the credentials file?`)) {
      const res = await deleteUserAccount(usr.id);
      if (res.success) {
        await refreshUsers();
        setFileTextData('');
      } else {
        alert(res.error || 'Could not delete user.');
      }
    }
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (!newEmail.trim() || !newEmail.includes('@')) {
      setRegError('Please enter a valid email address.');
      return;
    }

    const policyProblem = checkPasswordPolicy(newPassword);
    if (policyProblem) {
      setRegError(policyProblem);
      return;
    }

    const res = await registerUser(newEmail, newPassword, newRole, newName);
    if (!res.success) {
      setRegError(res.error || 'Registration failed.');
      return;
    }

    setRegSuccess(`Account for ${newEmail.trim()} created in credentials file.`);
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    await refreshUsers();
    setFileTextData('');
    setTimeout(() => setRegSuccess(''), 3000);
  };

  const handleCopyFileText = async () => {
    const text = fileTextData || (await loadFileText());
    await navigator.clipboard.writeText(text);
    setCopiedFileText(true);
    setTimeout(() => setCopiedFileText(false), 2000);
  };

  const handleDownloadCredentialsFile = async () => {
    const text = fileTextData || (await loadFileText());
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `userCredentials_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-white font-sans">
      {/* Top Admin Security Card */}
      <div className="bg-[#12131d] border border-amber-500/60 p-5 rounded-sm shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black tracking-wider uppercase text-amber-400 font-mono flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <span>ADMIN SECURITY & USER CREDENTIALS FILE MANAGEMENT</span>
          </h2>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Manage registered accounts, update passwords, set permissions, and inspect/backup the credentials file (/src/data/userCredentials.ts).
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setShowFilePreview(!showFilePreview)}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-900/80 hover:bg-purple-800 text-purple-200 border border-purple-500/80 rounded font-bold uppercase cursor-pointer transition-colors"
          >
            <FileCode className="w-4 h-4" />
            <span>{showFilePreview ? 'HIDE FILE VIEW' : 'VIEW CREDENTIALS FILE'}</span>
          </button>

          <button
            onClick={handleDownloadCredentialsFile}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-400 rounded font-bold uppercase cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>DOWNLOAD .TXT FILE</span>
          </button>
        </div>
      </div>

      {/* File Data Code Box Preview */}
      {showFilePreview && (
        <div className="bg-[#0b0c10] border border-purple-500/80 p-4 rounded-sm shadow-2xl space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <div className="flex items-center gap-2 text-purple-300 text-xs font-bold uppercase">
              <FileCode className="w-4 h-4 text-purple-400" />
              <span>/src/data/userCredentials.ts (Live Credentials Store File)</span>
            </div>
            <button
              onClick={handleCopyFileText}
              className="flex items-center gap-1 text-xs text-gray-300 hover:text-white bg-gray-800 px-2.5 py-1 rounded cursor-pointer"
            >
              {copiedFileText ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">COPIED</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-gray-400" />
                  <span>COPY DATA</span>
                </>
              )}
            </button>
          </div>

          <pre className="text-xs text-emerald-400 bg-[#12131b] p-3 rounded overflow-x-auto max-h-60 leading-relaxed">
            {fileTextData || 'Loading account inventory…'}
          </pre>
        </div>
      )}

      {/* Main Grid: User Accounts List + Add User Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Accounts Management Table (2 cols on lg) */}
        <div className="lg:col-span-2 bg-[#12131d] border border-gray-700/80 p-5 rounded-sm shadow-xl space-y-4">
          <h3 className="text-sm font-black tracking-wider uppercase text-blue-400 font-mono border-b border-gray-700 pb-2 flex items-center justify-between">
            <span>REGISTERED USER ACCOUNTS ({users.length})</span>
            <span className="text-[11px] text-gray-400 font-normal">Passwords editable below by Admin</span>
          </h3>

          {/* Only rendered when the account list could not be fetched. Without it
              a failed load looks identical to an installation with no accounts. */}
          {loadError && (
            <div className="p-2.5 bg-red-950/90 border border-red-500/80 text-red-200 rounded flex items-center gap-2 text-[11px] font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{loadError}</span>
            </div>
          )}

          <div className="space-y-4 overflow-y-auto max-h-[600px] pr-1">
            {users.map((usr) => {
              const isEditing = editingPasswords[usr.email] !== undefined;
              const hasFeedback = passFeedback?.email === usr.email;

              return (
                <div
                  key={usr.id}
                  className="bg-[#181a26] border border-gray-700/80 p-4 rounded space-y-3 font-mono text-xs hover:border-gray-600 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-700/60 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{usr.name || usr.email}</span>
                        <span className="text-[10px] text-gray-500">({usr.id})</span>
                      </div>
                      <span className="text-amber-300 font-bold block mt-0.5">{usr.email}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRoleToggle(usr)}
                        className={`px-2.5 py-1 rounded text-[10px] font-extrabold uppercase border cursor-pointer transition-all ${
                          usr.role === 'ADMIN'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-500'
                            : 'bg-blue-950/80 text-blue-300 border-blue-500'
                        }`}
                        title="Click to toggle User Role"
                      >
                        ROLE: {usr.role}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteUser(usr)}
                        className="p-1.5 text-gray-400 hover:text-red-400 bg-gray-800 hover:bg-red-950 rounded cursor-pointer transition-colors"
                        title="Delete User Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Password Modification Form for this user */}
                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-bold text-gray-300 uppercase flex items-center justify-between">
                      <span className="flex items-center gap-1 text-gray-300">
                        <Key className="w-3.5 h-3.5 text-amber-400" />
                        <span>UPDATE PASSWORD IN FILE</span>
                      </span>
                      <span className="text-[10px] text-gray-500 lowercase">
                        current: ••••••••
                      </span>
                    </label>

                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="Enter new password"
                        value={editingPasswords[usr.email] || ''}
                        onChange={(e) =>
                          setEditingPasswords((prev) => ({ ...prev, [usr.email]: e.target.value }))
                        }
                        className="flex-1 bg-[#0f1017] border border-gray-600 text-white placeholder-gray-500 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-amber-400 font-mono"
                      />

                      <button
                        type="button"
                        onClick={() => handlePasswordChangeSubmit(usr)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase rounded cursor-pointer transition-colors flex items-center gap-1 shadow"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>SAVE</span>
                      </button>
                    </div>

                    {hasFeedback && passFeedback && (
                      <div
                        className={`text-[11px] p-2 rounded flex items-center gap-1.5 font-sans ${
                          passFeedback.isError
                            ? 'bg-red-950/90 text-red-200 border border-red-500/80'
                            : 'bg-emerald-950/90 text-emerald-200 border border-emerald-500/80'
                        }`}
                      >
                        {passFeedback.isError ? (
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        <span>{passFeedback.msg}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add New Account Form (1 col on lg) */}
        <div className="bg-[#12131d] border border-gray-700/80 p-5 rounded-sm shadow-xl space-y-4">
          <h3 className="text-sm font-black tracking-wider uppercase text-emerald-400 font-mono border-b border-gray-700 pb-2 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>CREATE USER ACCOUNT</span>
          </h3>

          <form onSubmit={handleAddUserSubmit} className="space-y-3 font-mono text-xs">
            {regError && (
              <div className="p-2.5 bg-red-950/90 border border-red-500/80 text-red-200 rounded flex items-center gap-2 text-[11px]">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{regError}</span>
              </div>
            )}

            {regSuccess && (
              <div className="p-2.5 bg-emerald-950/90 border border-emerald-500/80 text-emerald-200 rounded flex items-center gap-2 text-[11px]">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{regSuccess}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">Full Name</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. System Specialist"
                  className="w-full bg-[#181922] border border-gray-600 text-white placeholder-gray-500 text-xs px-3 py-2 pr-8 rounded focus:outline-none focus:border-emerald-400"
                />
                <User className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. tech@hvac-ctrl.com"
                  className="w-full bg-[#181922] border border-gray-600 text-white placeholder-gray-500 text-xs px-3 py-2 pr-8 rounded focus:outline-none focus:border-emerald-400"
                />
                <Mail className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">Initial Password</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`At least ${PASSWORD_MIN_LENGTH} chars`}
                  className="w-full bg-[#181922] border border-gray-600 text-white placeholder-gray-500 text-xs px-3 py-2 pr-8 rounded focus:outline-none focus:border-emerald-400"
                />
                <Lock className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">User Permission Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full bg-[#181922] border border-gray-600 text-white text-xs px-3 py-2 rounded focus:outline-none focus:border-emerald-400 uppercase font-bold"
              >
                <option value="OPERATOR">OPERATOR (Dashboard & Valve Control)</option>
                <option value="ADMIN">ADMIN (Full Hardware & User Account Rights)</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase rounded shadow cursor-pointer transition-colors flex items-center justify-center gap-2 mt-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>SAVE USER TO CREDENTIALS FILE</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
