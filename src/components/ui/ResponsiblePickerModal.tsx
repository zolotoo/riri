'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

export type TemplateRole = { id: string; label: string };

interface ResponsiblePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  refId: string;
  refCaption?: string;
  roles: TemplateRole[];
  participants: string[];
  currentResponsibles: { templateId?: string; label?: string; value: string }[];
  onSave: (items: { templateId: string; value: string }[]) => Promise<boolean>;
}

export function ResponsiblePickerModal({
  isOpen,
  onClose,
  refId: _refId,
  refCaption,
  roles,
  participants,
  currentResponsibles,
  onSave,
}: ResponsiblePickerModalProps) {
  const [step, setStep] = useState<'role' | 'person'>('role');
  const [selectedRole, setSelectedRole] = useState<TemplateRole | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleRoleSelect = (role: TemplateRole) => {
    setSelectedRole(role);
    setStep('person');
  };

  const handlePersonSelect = async (person: string) => {
    if (!selectedRole) return;
    setSaving(true);
    const merged = [...currentResponsibles.filter(r => r.templateId !== selectedRole.id)];
    merged.push({ templateId: selectedRole.id, value: person });
    const ok = await onSave(merged.map(r => ({ templateId: r.templateId!, value: r.value })));
    setSaving(false);
    if (ok) {
      onClose();
      setStep('role');
      setSelectedRole(null);
    }
  };

  const handleBack = () => {
    setStep('role');
    setSelectedRole(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative w-full max-w-sm mx-4 max-h-[85vh] flex flex-col rounded-t-3xl md:rounded-3xl overflow-hidden safe-bottom"
        style={{
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(32px) saturate(200%)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.9)',
          boxShadow: '0 32px 64px -16px rgba(15,23,42,0.2), inset 0 1px 0 rgba(255,255,255,0.95)',
        }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200/60">
          <div>
            <h3 className="text-base font-semibold text-slate-800 tracking-tight">Ответственный</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[240px]">{refCaption || 'Исходник'}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 'role' ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Выбери роль</p>
              {roles.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">Настрой роли в карточке любого видео проекта</p>
              ) : (
                roles.map(role => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => handleRoleSelect(role)}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-2xl transition-all touch-manipulation text-left",
                      "bg-white/90 border border-slate-200/80 shadow-sm",
                      "hover:bg-white hover:border-slate-300 hover:shadow-md active:scale-[0.99]"
                    )}
                  >
                    <span className="text-[15px] font-medium text-slate-800">{role.label}</span>
                    <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleBack}
                className="text-xs text-slate-500 hover:text-slate-700 mb-3 flex items-center gap-1"
              >
                ← {selectedRole?.label}
              </button>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Участники</p>
              {participants.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">Добавь участников в проект или укажи имя в карточке видео</p>
              ) : (
                participants.map(person => (
                  <button
                    key={person}
                    type="button"
                    onClick={() => handlePersonSelect(person)}
                    disabled={saving}
                    className={cn(
                      "w-full flex items-center gap-3 p-4 rounded-2xl transition-all touch-manipulation text-left",
                      "bg-white/90 border border-slate-200/80 shadow-sm",
                      "hover:bg-indigo-50 hover:border-indigo-200 hover:shadow-md active:scale-[0.99]",
                      "disabled:opacity-60 disabled:pointer-events-none"
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-sm shrink-0">
                      {person[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="text-[15px] font-medium text-slate-800">{person}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
