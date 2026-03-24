export default function RegisterLoading() {
  return (
    <main>
      <section className="pt-36 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="tg-skeleton h-7 w-52 mx-auto mb-6" />
          <div className="tg-skeleton h-12 w-3/4 mx-auto mb-4" />
          <div className="tg-skeleton h-5 w-2/3 mx-auto" />
        </div>
      </section>
      <section className="pb-28 px-6">
        <div className="max-w-5xl mx-auto card-glow p-6 md:p-8 rounded-2xl">
          <div className="tg-skeleton h-16 w-full mb-6" />
          <div className="tg-skeleton h-8 w-56 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <div className="tg-skeleton h-12 w-full" />
            <div className="tg-skeleton h-12 w-full" />
            <div className="tg-skeleton h-12 w-full" />
            <div className="tg-skeleton h-12 w-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="tg-skeleton h-24 w-full" />
            <div className="tg-skeleton h-24 w-full" />
            <div className="tg-skeleton h-24 w-full" />
          </div>
          <div className="tg-skeleton h-12 w-full" />
        </div>
      </section>
    </main>
  );
}

