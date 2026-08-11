import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type InviteRoomPanelProps = {
  roomCode: string;
};

function buildInviteUrl(roomCode: string): string {
  const url = new URL(window.location.origin);

  url.searchParams.set("room", roomCode);

  return url.toString();
}

export function InviteRoomPanel({ roomCode }: InviteRoomPanelProps) {
  const [copyMessage, setCopyMessage] = useState("");

  const inviteUrl = buildInviteUrl(roomCode);

  async function copyInviteUrl() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyMessage("Ссылка скопирована.");
    } catch {
      setCopyMessage("Не удалось скопировать ссылку. Скопируй её вручную.");
    }
  }

  return (
    <article className="t2-tile t2-tile--gray t2-span-12">
      <p className="t2-eyebrow">Пригласить игроков</p>

      <p className="t2-lead">
        Отправь ссылку или попроси игрока отсканировать QR-код.
      </p>

      <div className="t2-invite">
        <div className="t2-invite__content">
          <p className="t2-copy">Код комнаты: {roomCode}</p>

          <label className="t2-copy t-w" htmlFor="room-invite-link">
            Ссылка для подключения
          </label>

          <input id="room-invite-link t-w" readOnly value={inviteUrl} />

          <button
            className="t2-button t2-button--mono"
            onClick={copyInviteUrl}
            type="button"
          >
            Скопировать ссылку
          </button>

          {copyMessage && <p className="t2-copy">{copyMessage}</p>}
        </div>

        <div className="t2-invite__qr">
          <QRCodeSVG
            bgColor="#ffffff"
            fgColor="#000000"
            includeMargin
            level="M"
            size={192}
            value={inviteUrl}
          />
        </div>
      </div>
    </article>
  );
}
