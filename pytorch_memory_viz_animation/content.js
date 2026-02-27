(() => {
    'use strict';

    function findAndLog() {
        for (const el of document.querySelectorAll('body *')) {
            if (el.textContent.trim() === 'Allocator State History') {
                console.log('[pviz] Found anchor element:', el);
                console.log('[pviz] Parent:', el.parentElement);

                // Find the nearest <select> ancestor
                const select = el.closest('select') || el.parentElement?.closest('select');
                if (select) {
                    console.log('[pviz] Found <select>:', select);
                    select.addEventListener('change', () => {
                        console.log('[pviz] select changed ->', select.value);
                        if (select.value === 'Allocator State History') {
                            const target = document.querySelector('body > div:nth-child(9) > div > div');
                            console.log('[pviz] Allocator State History selected – target div:', target);
                            var master_array = target.getElementsByTagName('pre');
                            console.log('length of master_array:', master_array.length);
                            (async () => {
                                await new Promise(resolve => setTimeout(resolve, 5000));
                                var yy = document.createElement('button');
                                yy.textContent = 'Click me';
                                yy.onclick = function () {
                                    console.log('Button clicked!');
                                    (async () => {
                                        for (var i = 0; i < master_array.length; i++) {
                                            //target.getElementsByTagName('pre')[i].click();**using d3**
                                            target.getElementsByTagName('pre')[i].dispatchEvent(new MouseEvent('mousedown', {
                                                bubbles: true,
                                                cancelable: true,
                                                view: window
                                            }));
                                            await new Promise(resolve => setTimeout(resolve, 300));
                                        }
                                    })();
                                };
                                target.parentElement.insertBefore(yy, target);
                            })();
                        }
                    });
                } else {
                    console.warn('[pviz] No <select> ancestor found for the anchor element');
                }
                return;
            }
        }
        console.warn('[pviz] "Allocator State History" not found in DOM');
    }

    // wait for page to settle
    if (document.readyState === 'complete') {
        findAndLog();
    } else {
        window.addEventListener('load', findAndLog);
    }
})();
