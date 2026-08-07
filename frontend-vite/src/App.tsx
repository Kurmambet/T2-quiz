function App() {
  return (
    <main className="t2-page">
      <section className="t2-bento">
        <article className="t2-tile t2-tile--white t2-span-8">
          <p className="t2-eyebrow">T2 Quiz Rooms</p>

          <h1 className="t2-title">Квиз, который объединяет команду</h1>

          <p className="t2-lead">
            Один рум для ведущего, офлайн-зала и удалённых участников.
          </p>

          <button className="t2-button t2-button--lime">Создать игру</button>
        </article>

        <aside className="t2-tile t2-tile--magenta t2-span-4">
          <p className="t2-eyebrow">Командный режим</p>
          <p className="t2-price">
            12 <small>игроков</small>
          </p>
        </aside>

        <article className="t2-tile t2-tile--blue t2-span-4">
          <p className="t2-eyebrow">Онлайн</p>
          <h2 className="t2-title t2-title--stencil">В игре</h2>
        </article>

        <article className="t2-tile t2-tile--black t2-span-8">
          <p className="t2-eyebrow">Проверка стиля</p>
          <p className="t2-copy">
            Halvar используется для крупных заголовков, Rooftop — для
            интерфейсного и основного текста.
          </p>
        </article>
      </section>
    </main>
  );
}

export default App;
