import IconSprite from '../components/IconSprite'
import Hero from '../components/sections/Hero'
import Stats from '../components/sections/Stats'
import Cold from '../components/sections/Cold'
import Features from '../components/sections/Features'
import Answered from '../components/sections/Answered'
import Impact from '../components/sections/Impact'
import Everyone from '../components/sections/Everyone'
import Process from '../components/sections/Process'
import Faq from '../components/sections/Faq'
import Contact from '../components/sections/Contact'
import Footer from '../components/Footer'

export default function Home() {
  return (
    <>
      <IconSprite />
      {/* The source index.html has no <main> landmark at all (confirmed in reference/original/index.html);
          demo.html already has one. Adding it here is a pixel-invisible a11y fix (Lighthouse: "no main
          landmark") — <main> is display:block with no styling hooks in site.css, so nothing renders
          differently. Footer stays outside, as its own <footer> landmark, matching demo.html's pattern
          of <main> wrapping only the page content, not chrome. */}
      <main>
        <Hero />
        <Stats />
        <Cold />
        <Features />
        <Answered />
        <Impact />
        <Everyone />
        <Process />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
