import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, PlugZap, Trash2 } from "lucide-react";
import { trpc } from "../providers/trpc";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../lib/i18n";

// BYOK（Bring Your Own Key）设置面板（阶段3 M1）：
// DeepSeek key 仅存服务端密文（AES-256-GCM），启用后你的 AI 调用走自己的 key；
// 未启用时 owner 账号回落服务端 key，其余账号需在此配置后才能用 AI。
// D1 显式原则：保存新 key 会停用开关，必须重新打开才切换。

export function ByokPanel() {
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const status = trpc.settings.byokStatus.useQuery(undefined, { enabled: isAuthenticated });
  const save = trpc.settings.byokSaveKey.useMutation({
    onSuccess: (data) => {
      setKey("");
      toast.success(t("API key saved (ends in {tail}). Enable it below to switch to your key.", { tail: data.keyTail }));
      void status.refetch();
    },
    onError: (e) => toast.error(t(e.message)),
  });
  const setEnabled = trpc.settings.byokSetEnabled.useMutation({
    onSuccess: (data) => {
      toast.success(data.enabled ? t("Your own key is now active for AI calls.") : t("Switched back to the site-provided AI (if available)."));
      void status.refetch();
    },
    onError: (e) => toast.error(t(e.message)),
  });
  const test = trpc.settings.byokTest.useMutation({
    onSuccess: (data) => toast.success(t("Connection OK — default model: {model}", { model: data.modelId })),
    onError: (e) => toast.error(t(e.message)),
  });
  const remove = trpc.settings.byokDelete.useMutation({
    onSuccess: () => {
      toast.success(t("API key removed."));
      void status.refetch();
    },
    onError: (e) => toast.error(t(e.message)),
  });
  const [key, setKey] = useState("");

  if (!isAuthenticated) {
    return (
      <section className="settings-section">
        <div className="settings-heading"><span>07</span><div><h2>{t("AI keys (bring your own)")}</h2><p>{t("Sign in to configure your own model provider key.")}</p></div></div>
      </section>
    );
  }

  const s = status.data;
  return (
    <section className="settings-section">
      <div className="settings-heading"><span>07</span><div><h2>{t("AI keys (bring your own)")}</h2><p>{t("Use your own DeepSeek key for AI features. The key is stored encrypted on the server and never shown again.")}</p></div></div>

      {!s?.ready && <p className="form-error" role="alert">{t("BYOK is not available on this deployment (missing server secret).")}</p>}

      {s?.configured ? (
        <>
          <p className="form-hint"><KeyRound size={14} /> {t("Saved key: {tail}", { tail: s.keyTail ?? "••••" })}</p>
          <label className="switch-row">
            <span><strong>{t("Use my own key for AI calls")}</strong><small>{t("When off, the site-provided AI is used if available.")}</small></span>
            <input type="checkbox" role="switch" checked={s.enabled} disabled={!s.ready || setEnabled.isPending} onChange={(e) => setEnabled.mutate({ provider: "deepseek", enabled: e.target.checked })} />
          </label>
          <div className="backup-actions">
            <button type="button" className="btn btn-secondary" disabled={test.isPending} onClick={() => test.mutate({ provider: "deepseek" })}><PlugZap size={15} />{t("Test connection")}</button>
            <button type="button" className="danger-link" onClick={() => remove.mutate({ provider: "deepseek" })}><Trash2 size={15} />{t("Remove key")}</button>
          </div>
        </>
      ) : (
        <p className="form-hint">{t("No key saved yet.")}</p>
      )}

      <label className="field-label" htmlFor="byok-key">{t(s?.configured ? "Replace API key" : "DeepSeek API key")}</label>
      <div className="proxy-row">
        <input id="byok-key" className="field" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={t("sk-…")} />
        <button type="button" className="btn btn-secondary" disabled={!s?.ready || key.trim().length < 10 || save.isPending} onClick={() => save.mutate({ provider: "deepseek", apiKey: key })}>{t("Save")}</button>
      </div>
      <p className="form-hint">{t("Saving a new key turns the switch off — turn it on explicitly to switch. The key is transmitted once over your signed-in HTTPS session and stored as AES-256-GCM ciphertext.")}</p>
    </section>
  );
}
