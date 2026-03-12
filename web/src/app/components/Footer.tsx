
import { Logo3D } from "./Logo3D";

export function Footer() {
    return (
        <footer className="border-t border-border bg-card mt-12">
            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
                    <div>
                        <h4 className="mb-4">Markets</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><a href="#" className="hover:text-foreground transition-colors">Politics</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Sports</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Crypto</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Business</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-4">Resources</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><a href="#" className="hover:text-foreground transition-colors">Help Center</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">API Docs</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Community</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-4">Company</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Careers</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Press</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="mb-4">Legal</h4>
                        <ul className="space-y-2 text-sm text-muted-foreground">
                            <li><a href="#" className="hover:text-foreground transition-colors">Terms</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Privacy</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Cookie Policy</a></li>
                            <li><a href="#" className="hover:text-foreground transition-colors">Licenses</a></li>
                        </ul>
                    </div>
                </div>
                <div className="pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8">
                            <Logo3D className="w-full h-full" />
                        </div>
                        <span className="font-rajdhani font-bold text-xl tracking-wider text-foreground">ExoDuZe</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        © 2026 ExoDuZe. All rights reserved.
                    </p>
                    <div className="flex items-center gap-4">
                        <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                            <span className="sr-only">Twitter</span>
                            𝕏
                        </a>
                        <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                            <span className="sr-only">Discord</span>
                            💬
                        </a>
                        <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                            <span className="sr-only">Telegram</span>
                            ✈️
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
