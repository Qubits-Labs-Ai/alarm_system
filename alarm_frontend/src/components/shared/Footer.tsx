import { MapPin, Phone, Clock, Twitter, Github, Linkedin } from 'lucide-react';
import engroLogo from '@/assets/engro-logo.png';
import qbitLogo from '@/assets/qbit-logo.png';

export function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="relative py-12 overflow-hidden">
            {/* Centered Footer Container with max-width */}
            <div className="container mx-auto px-6 max-w-7xl">
                <div className="relative rounded-3xl border border-border/40 bg-[#F9F9F9]/60 dark:bg-[#1E1E1E]/60 border-lime-accent/20 backdrop-blur-xl shadow-lg p-8">
                    {/* Main Content */}
                    <div className="grid md:grid-cols-5 gap-4 mb-8">
                        {/* Brand Section */}
                        <div className="md:col-span-1 pr-10">
                            <div className="flex items-center gap-3 mb-4">
                                <img src={engroLogo} alt="Safety Copilot" className="h-10 w-auto" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground mb-2">Alarm System</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Intelligent alarm monitoring and notification system for real-time security and safety management.
                            </p>

                            {/* Location and Social Media Icons */}
                            <div className="flex items-center gap-4 mt-4">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <MapPin className="h-4 w-4 text-lime-accent" />
                                    <span className="whitespace-nowrap">Karachi, PK</span>
                                </div>
                                {/* Social Media Icons */}
                                <div className="flex items-center gap-2">
                                    <a
                                        href="https://twitter.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 rounded-full bg-muted/50 hover:bg-lime-accent/20 transition-colors group"
                                        aria-label="Twitter"
                                    >
                                        <Twitter className="h-4 w-4 text-muted-foreground group-hover:text-lime-accent transition-colors" />
                                    </a>
                                    <a
                                        href="https://github.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 rounded-full bg-muted/50 hover:bg-lime-accent/20 transition-colors group"
                                        aria-label="GitHub"
                                    >
                                        <Github className="h-4 w-4 text-muted-foreground group-hover:text-lime-accent transition-colors" />
                                    </a>
                                    <a
                                        href="https://linkedin.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 rounded-full bg-muted/50 hover:bg-lime-accent/20 transition-colors group"
                                        aria-label="LinkedIn"
                                    >
                                        <Linkedin className="h-4 w-4 text-muted-foreground group-hover:text-lime-accent transition-colors" />
                                    </a>
                                </div>
                            </div>

                        </div>

                        {/* Product Links */}
                        <div>
                            <h4 className="text-sm font-bold text-foreground mb-4">Product</h4>
                            <nav className="space-y-3">
                                <a href="#features" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Features
                                </a>
                                <a href="#use-cases" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Use Cases
                                </a>
                                <a href="#testimonials" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Testimonials
                                </a>
                            </nav>
                        </div>

                        {/* Resources Links */}
                        <div>
                            <h4 className="text-sm font-bold text-foreground mb-4">Resources</h4>
                            <nav className="space-y-3">
                                <a href="/dashboard" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Dashboard
                                </a>
                                <a href="/analytics" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Analytics
                                </a>
                                <a href="/copilot" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Copilot
                                </a>
                            </nav>
                        </div>

                        {/* Engro EPCL & Contact */}
                        <div>
                            <h4 className="text-sm font-bold text-foreground mb-4">Engro EPCL</h4>
                            <nav className="space-y-3 mb-6">
                                <a href="#who-we-are" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Who We Are
                                </a>
                                <a href="#investor-relations" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Investor Relations
                                </a>
                                <a href="#social-impact" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Social Impact
                                </a>
                                <a href="#life-epcl" className="block text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                    Life @ EPCL
                                </a>
                            </nav>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold text-foreground mb-4">Contact</h4>
                            <div className="space-y-3 text-sm text-muted-foreground">
                                <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 text-lime-accent mt-0.5 flex-shrink-0" />
                                    <span className="leading-relaxed">
                                        8th Floor, The Harbour Front Building, Marine Drive, Block 4, Clifton, Karachi
                                    </span>
                                </div>
                                <a href="tel:+922111411411" className="flex items-center gap-2 hover:text-lime-accent transition-colors">
                                    <Phone className="h-4 w-4 text-lime-accent" />
                                    <span>+92 21 111 411 411</span>
                                </a>
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-lime-accent" />
                                    <div>
                                        <div className="font-semibold text-foreground">Office Hours</div>
                                        <div>Mon to Fri: 9 am - 5 pm (PST)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-border/40 my-6" />

                    {/* Bottom Section */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-6">
                        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
                            <span>© {currentYear} Engro Polymer & Chemicals. All rights reserved.</span>
                            <span className="hidden md:inline">•</span>
                            <span>Powered by Alarm System</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <a href="#privacy" className="text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                Privacy Policy
                            </a>
                            <a href="#disclaimer" className="text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                Disclaimer
                            </a>
                            <a href="#sitemap" className="text-sm text-muted-foreground hover:text-lime-accent transition-colors">
                                Sitemap
                            </a>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-border/40 my-6" />

                    {/* Qbit Dynamics Logo - Centered */}
                    <div className="flex justify-center items-center gap-2 text-sm text-muted-foreground">
                        <span>Built by</span>
                        <img
                            src={qbitLogo}
                            alt="Qubit Dynamics"
                            className="h-16 w-auto opacity-70 invert dark:invert-0 hover:opacity-100 transition-opacity"
                        />
                    </div>
                </div>
            </div>
        </footer>
    );
}
