import Button from '../Button';
import './HomeSidebarPromoCard.scss';

function HomeSidebarPromoCard({
    title,
    headline,
    buttonText,
    backgroundImage,
    image,
    href,
    onClick,
    variant = 'download'
}) {
    const Card = href ? 'a' : 'div';

    return (
        <Card
            className={`home-sidebar-download-card ${
                variant === 'plus' ? 'home-sidebar-plus-card' : ''
            }`}
            style={{ backgroundImage: `url(${backgroundImage})` }}
            href={href}
            onClick={href ? undefined : onClick}
            role={href ? undefined : 'button'}
            tabIndex={href ? undefined : 0}
            onKeyDown={href ? undefined : (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick?.(event);
                }
            }}
        >
            <div className="home-sidebar-download-copy">
                <p className="text-style-label-medium color-fig-subtle">
                    {title}
                </p>
                <p className="home-sidebar-download-headline text-style-h-3-semibold color-fig-default">
                    {headline}
                </p>
                <Button
                    text={buttonText}
                    typography="md"
                    type={variant === 'download' ? 'primary' : 'secondary'}
                    enabled
                    className="home-sidebar-download-button"
                />
            </div>
            <div className="home-sidebar-download-image">
                <img src={image} alt="" />
            </div>
        </Card>
    );
}

export default HomeSidebarPromoCard;