export default function RouteLoading() {
  return (
    <main>
      <section className="pt-36 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="tg-skeleton h-7 w-36 mx-auto mb-6" />
          <div className="tg-skeleton h-12 w-3/4 mx-auto mb-4" />
          <div className="tg-skeleton h-5 w-2/3 mx-auto" />
        </div>
        <div className="max-w-3xl mx-auto mt-10 card-glow p-6 md:p-8 rounded-2xl">
          <div className="flex gap-2 mb-6 flex-wrap">
            <div className="tg-skeleton h-9 w-24" />
            <div className="tg-skeleton h-9 w-24" />
            <div className="tg-skeleton h-9 w-24" />
            <div className="tg-skeleton h-9 w-24" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
            <div className="tg-skeleton h-12 w-full" />
            <div className="tg-skeleton h-10 w-10 mx-auto" />
            <div className="tg-skeleton h-12 w-full" />
          </div>
          <div className="tg-skeleton h-12 w-full mt-5" />
        </div>
      </section>
      <section className="px-6 pb-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="tg-skeleton h-32 w-full" />
          <div className="tg-skeleton h-32 w-full" />
          <div className="tg-skeleton h-32 w-full" />
        </div>
      </section>
    </main>
  );
}

