export function ImagePlaceholder({ className = '', label = 'IMG' }) {
    return <div className={`image-placeholder ${className}`}>{label}</div>;
}

export function SectionTitle({ title, subtitle }) {
    return (
        <div className="section-heading">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
        </div>
    );
}
