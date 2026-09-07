/** Hit counter badge served by hits.sh (count only, no label). Increments on every page load. */
const COUNTER_SRC = 'https://hits.sh/jadwal-almuallim.app.svg?label=%20&color=0c574d&style=flat-square';

export function Footer() {
  return (
    <footer className="mt-8 flex flex-col gap-2 px-1 py-6 text-center text-xs leading-7 text-muted md:flex-row md:justify-between md:text-start">
      <span>
        جدول المعلم <span className="mx-2 text-[#bac7c0]">/</span> مساحة أجمل ليومك الدراسي
      </span>
      <span>أداة مستقلة، غير تابعة لمنصة مدرستي</span>
      <span className="inline-flex items-center justify-center gap-1.5 md:justify-start">
        <span>عدد الزوار</span>
        <img src={COUNTER_SRC} alt="عدّاد الزوار" className="h-[18px] rounded" />
      </span>
      <a href="https://x.com/az0xi?s=11" target="_blank" rel="noopener noreferrer" aria-label="حساب عزام الراشدي على منصة X" className="inline-flex items-center justify-center gap-1.5 font-bold text-primary">
        <span>من تصميم عزام الراشدي</span>
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.49 22H3.38l7.24-8.28L2.97 2h6.4l4.42 5.84L18.9 2Zm-1.09 17.84h1.72L8.43 4.05H6.58l11.23 15.79Z" />
        </svg>
        <b dir="ltr">@az0xi</b>
      </a>
    </footer>
  );
}
