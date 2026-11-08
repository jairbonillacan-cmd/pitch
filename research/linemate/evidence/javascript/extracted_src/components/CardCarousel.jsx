import React, { useState, useEffect, useRef } from "react";
import "./CardCarousel.scss";
import "../pages/Home.scss";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Scrollbar, A11y, Controller } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/scrollbar";
import { useMediaQuery } from "react-responsive";
import { useTranslation } from "react-i18next";

function CardCarousel({
  listOfElements,
  elementsPerView,
  spaceBetweenSlides,
  title,
  CardComponent,
  showHeader = true,
  headerContent = null,
  breakpoints = null,
  mobileOnlyControls = false,
  desktopOnlyControls = false,
}) {
  const { t } = useTranslation();
  const [currentTheme, setCurrentTheme] = useState("");
  const prevRef = useRef();
  const nextRef = useRef();
  const isSmallScreen = useMediaQuery({ maxWidth: 1200 });
  const isCarouselTouchEnabled = useMediaQuery({ maxWidth: 1000 });
  const [isPeek, setIsPeek] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  let elementsPerViewArr = [];

  if (elementsPerView === 4) {
    elementsPerViewArr.push(3.1, 2.4, 1.7);
  }
  if (elementsPerView === 3) {
    elementsPerViewArr.push(2.2, 1.8, 1.4);
  }

  const defaultBreakpoints = {
    0: { slidesPerView: 1.05 },
    501: { slidesPerView: 1.6 },
    1001: { slidesPerView: elementsPerView },
  };

  const hardDisabled = listOfElements.length <= 1;

  const updatePeekAndEdges = (swiper) => {
    const spv = swiper.params.slidesPerView;
    const peek = typeof spv === "number" && !Number.isInteger(spv);
    setIsPeek(peek);
    setAtStart(swiper.isBeginning);
    setAtEnd(swiper.isEnd);
  };

  useEffect(() => {
    const handler = (e) => setCurrentTheme(e.detail.theme);
    window.addEventListener("themeChange", handler);
    return () => window.removeEventListener("themeChange", handler);
  }, []);

  const prevDisabled = hardDisabled || atStart;
  const nextDisabled = hardDisabled || atEnd;

  return (
    <div>
      {showHeader && (
        <div className="card-carousel-section-header">
          <div className="card-carousel-title-nav">
            <div className="card-carousel-header-left">
              {headerContent || (
                <>
                  <p
                    className={`${
                      isSmallScreen ? "text-style-h-3-semibold" : "text-style-h-2-semibold"
                    } home-page-title-text-desktop`}
                  >
                    {title}
                  </p>
                  <p
                    className={`${
                      isSmallScreen ? "text-style-h-3-semibold" : "text-style-h-2-semibold"
                    } text-style-h-2-semibold home-page-title-text-mobile`}
                  >
                    {title}
                  </p>
                </>
              )}
            </div>

            <div className={`card-carousel-header-controls${mobileOnlyControls ? " card-carousel-header-controls-mobile-only" : ""}${desktopOnlyControls ? " card-carousel-header-controls-desktop-only" : ""}`}>
              <button
                ref={prevRef}
                type="button"
                className={`card-carousel-nav-button ${prevDisabled ? "swiper-button-disabled" : ""}`}
                disabled={prevDisabled}
                aria-label={t("web.carousel.previous")}
              >
                <img src="../../assets/chevron-left.svg" alt={t("web.carousel.previous")} />
              </button>

              <button
                ref={nextRef}
                type="button"
                className={`card-carousel-nav-button ${nextDisabled ? "swiper-button-disabled" : ""}`}
                disabled={nextDisabled}
                aria-label={t("web.carousel.next")}
              >
                <img src="../../assets/chevron-right.svg" alt={t("web.carousel.next")} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card-carousel-container">
        <div className="card-carousel-swiper-viewport">
          <Swiper
            modules={[Navigation, Pagination, Scrollbar, A11y, Controller]}
            slidesPerView={elementsPerView}
            navigation={{
              prevEl: prevRef?.current,
              nextEl: nextRef?.current,
            }}
            updateOnWindowResize
            spaceBetween={spaceBetweenSlides}
            watchOverflow={false}
            centerInsufficientSlides={false}
            allowTouchMove={isCarouselTouchEnabled}
            breakpoints={breakpoints || defaultBreakpoints}
            onBeforeInit={(swiper) => {
              swiper.params.navigation = swiper.params.navigation || {};
              swiper.params.navigation.prevEl = prevRef.current;
              swiper.params.navigation.nextEl = nextRef.current;
            }}
            onInit={(swiper) => {
              swiper.navigation.init();
              swiper.navigation.update();
              updatePeekAndEdges(swiper);
            }}
            onSlideChange={updatePeekAndEdges}
            onBreakpoint={(swiper) => {
              swiper.update();
              updatePeekAndEdges(swiper);
            }}
          >
            {listOfElements.map((inputElement, index) => (
              <SwiperSlide key={index}>
                <CardComponent
                  element={inputElement}
                  className="card-carousel-daily-card"
                  theme={currentTheme}
                />
              </SwiperSlide>
            ))}
          </Swiper>

          {isPeek && !atStart && <div className="carousel-gradient left" />}
          {isPeek && !atEnd && <div className="carousel-gradient right" />}
        </div>
      </div>
    </div>
  );
}

export default CardCarousel;
