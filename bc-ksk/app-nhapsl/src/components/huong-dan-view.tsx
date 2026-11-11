import type { ReactNode } from 'react';
import { MUC, NAM_BUOC, PHIM_TAT, type Khoi } from './huong-dan-noi-dung';

/** Chuyển **đậm** và `phím` trong chuỗi thành thẻ HTML. */
function Rich({ text }: { text: string }) {
  const phan: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let cuoi = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cuoi) phan.push(text.slice(cuoi, m.index));
    if (m[1] !== undefined) phan.push(<strong key={k++}>{m[1]}</strong>);
    else phan.push(<kbd key={k++}>{m[2]}</kbd>);
    cuoi = m.index + m[0].length;
  }
  if (cuoi < text.length) phan.push(text.slice(cuoi));
  return <>{phan}</>;
}

function KhoiView({ khoi }: { khoi: Khoi }) {
  return (
    <div className="hd-khoi">
      {khoi.tieuDe && <h3 className="hd-h3">{khoi.tieuDe}</h3>}
      {khoi.anh && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="hd-anh"
          src={`/huong-dan/${khoi.anh.file}`}
          alt={khoi.anh.alt}
          loading="lazy"
          width={1366}
        />
      )}
      {khoi.buoc && (
        <ol className="hd-buoc">
          {khoi.buoc.map((b, i) => (
            <li key={i} data-n={b.n ?? i + 1}>
              <Rich text={b.t} />
            </li>
          ))}
        </ol>
      )}
      {khoi.ds && (
        <ul className="hd-ds">
          {khoi.ds.map((d, i) => (
            <li key={i}>
              <Rich text={d} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HuongDanView() {
  return (
    <div className="hd-trang">
      <header className="hd-dau">
        <h1 className="hd-h1">Hướng dẫn sử dụng nhanh</h1>
        <p className="hd-lead">
          Rà soát hồ sơ giấy khám sức khỏe toàn dân 2026. Làm theo từng bước, đối chiếu số trong khung đỏ ở ảnh
          với số đầu dòng bên dưới.
        </p>
        <p className="hd-in-ra">
          <a href="/huong-dan-nhanh.pdf" className="hd-nut">Tải bản PDF để in</a>
        </p>
      </header>

      <nav className="hd-muc-luc" aria-label="Mục lục hướng dẫn">
        <h2 className="hd-h2 hd-h2-nho">Mục lục</h2>
        <ul className="hd-toc-dau">
          <li><a href="#nam-buoc">5 bước rà soát một hồ sơ</a></li>
          <li><a href="#phim-tat">Phím tắt</a></li>
        </ul>
        <ol>
          {MUC.map((m) => (
            <li key={m.id}><a href={`#${m.id}`}>{m.tieuDe}</a></li>
          ))}
        </ol>
      </nav>

      <section id="nam-buoc" className="hd-muc">
        <h2 className="hd-h2">5 bước rà soát một hồ sơ</h2>
        <p className="hd-khi">Nhớ năm bước này là đủ làm việc hằng ngày.</p>
        <ol className="hd-nam-buoc">
          {NAM_BUOC.map((b) => (
            <li key={b.so}>
              <span className="hd-so-lon">{b.so}</span>
              <strong>{b.ten}</strong>
              <span>{b.mo}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="phim-tat" className="hd-muc">
        <h2 className="hd-h2">Phím tắt trên màn rà soát</h2>
        <p className="hd-khi">Dùng bàn phím sẽ nhanh hơn dùng chuột khi làm nhiều hồ sơ.</p>
        <table className="hd-bang">
          <thead>
            <tr><th scope="col">Phím</th><th scope="col">Việc làm</th></tr>
          </thead>
          <tbody>
            {PHIM_TAT.map((p) => (
              <tr key={p.phim}>
                <td><kbd>{p.phim}</kbd></td>
                <td>{p.viec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {MUC.map((m, i) => (
        <section key={m.id} id={m.id} className={`hd-muc${m.danhChoAdmin ? ' hd-admin' : ''}`}>
          <h2 className="hd-h2">
            <span className="hd-so-muc">{i + 1}</span>
            {m.tieuDe}
          </h2>
          <p className="hd-khi"><strong>Khi nào dùng:</strong> {m.khiNao}</p>
          {m.khoi.map((k, j) => (
            <KhoiView key={j} khoi={k} />
          ))}
          {m.luuY && (
            <div className="hd-luu-y" role="note">
              <strong>Lưu ý</strong>
              <ul>
                {m.luuY.map((l, j) => (
                  <li key={j}><Rich text={l} /></li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
