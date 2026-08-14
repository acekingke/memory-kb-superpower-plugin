;;; engine.scm -- generic forward-chaining inference engine.

;; Tail-recursive replacements for mit-scheme's built-in filter-map/append-map.
;; mit-scheme's filter-map is non-tail and overflows the stack around ~300k
;; items, which breaks find-contradictions on a large KB (e.g. 769 non-predicate
;; facts → 295k pairs). These definitions shadow the built-ins within this file.

(define (filter-map f lst)
  (let loop ((remaining lst) (acc '()))
    (if (null? remaining)
        (reverse acc)
        (let ((v (f (car remaining))))
          (loop (cdr remaining)
                (if v (cons v acc) acc))))))

(define (append-map f lst)
  (let outer ((remaining lst) (acc '()))
    (if (null? remaining)
        (reverse acc)
        (let inner ((items (f (car remaining))) (a acc))
          (if (null? items)
              (outer (cdr remaining) a)
              (inner (cdr items) (cons (car items) a)))))))

(define (var? x)
  (and (symbol? x)
       (let ((s (symbol->string x)))
         (and (> (string-length s) 0)
              (char=? (string-ref s 0) #\?)))))

(define (append-map f l) (apply append (map f l)))

(define (match pattern datum bindings)
  (cond ((eq? bindings 'fail) 'fail)
        ((var? pattern)
         (let ((b (assq pattern bindings)))
           (if b
               (if (equal? (cdr b) datum) bindings 'fail)
               (cons (cons pattern datum) bindings))))
        ((and (pair? pattern) (pair? datum))
         (match (cdr pattern) (cdr datum)
                (match (car pattern) (car datum) bindings)))
        ((equal? pattern datum) bindings)
        (else 'fail)))

(define (instantiate template bindings)
  (cond ((var? template)
         (let ((b (assq template bindings)))
           (if b (cdr b) template)))
        ((pair? template)
         (cons (instantiate (car template) bindings)
               (instantiate (cdr template) bindings)))
        (else template)))

(define (rule-name r) (car r))
(define (rule-premises r) (cadr r))
(define (rule-conclusions r) (caddr r))

(define (match-premises premises facts bindings)
  (if (null? premises)
      (list bindings)
      (append-map
        (lambda (fact)
          (let ((b (match (car premises) fact bindings)))
            (if (eq? b 'fail)
                '()
                (match-premises (cdr premises) facts b))))
        facts)))

(define (fire-rule r facts)
  (append-map
    (lambda (bindings)
      (map (lambda (c) (instantiate c bindings)) (rule-conclusions r)))
    (match-premises (rule-premises r) facts '())))

(define (match-premises/explain premises facts bindings used)
  (if (null? premises)
      (list (list bindings (reverse used)))
      (append-map
        (lambda (fact)
          (let ((b (match (car premises) fact bindings)))
            (if (eq? b 'fail)
                '()
                (match-premises/explain (cdr premises) facts b (cons fact used)))))
        facts)))

(define (fire-rule/explain r facts)
  (append-map
    (lambda (result)
      (let ((bindings (car result))
            (used (cadr result)))
        (map (lambda (c)
               (list (instantiate c bindings) (rule-name r) used))
             (rule-conclusions r))))
    (match-premises/explain (rule-premises r) facts '() '())))

(define (add-facts facts new)
  (fold-left (lambda (acc f) (if (member f acc) acc (cons f acc))) facts new))

(define (run-to-fixpoint facts rules)
  (let* ((derived (append-map (lambda (r) (fire-rule r facts)) rules))
         (fresh (filter (lambda (f) (not (member f facts))) derived)))
    (if (null? fresh)
        facts
        (run-to-fixpoint (add-facts facts fresh) rules))))

(define (make-base-provenance facts)
  (map (lambda (f) (list f 'base)) facts))

(define (find-provenance fact provenance)
  (let loop ((items provenance))
    (cond ((null? items) #f)
          ((equal? (caar items) fact) (car items))
          (else (loop (cdr items))))))

(define (add-derived-with-provenance facts provenance derived)
  (let loop ((items derived) (fs facts) (pv provenance))
    (cond ((null? items) (cons fs pv))
          ((member (caar items) fs)
           (loop (cdr items) fs pv))
          (else
           (let ((conclusion (caar items))
                 (rule (cadar items))
                 (premises (caddar items)))
             (loop (cdr items)
                   (cons conclusion fs)
                   (cons (list conclusion 'rule rule premises) pv)))))))

(define (run-to-fixpoint/explain facts rules)
  (let loop ((fs facts) (pv (make-base-provenance facts)))
    (let* ((derived (append-map (lambda (r) (fire-rule/explain r fs)) rules))
           (result (add-derived-with-provenance fs pv derived))
           (next-facts (car result))
           (next-provenance (cdr result)))
      (if (= (length fs) (length next-facts))
          (cons fs next-provenance)
          (loop next-facts next-provenance)))))

(define (explain-fact fact provenance)
  (let ((entry (find-provenance fact provenance)))
    (cond ((not entry)
           (display "NO_EXPLANATION ")
           (write fact)
           (newline))
          ((eq? (cadr entry) 'base)
           (display "BASE ")
           (write fact)
           (newline))
          ((eq? (cadr entry) 'rule)
           (display "DERIVED ")
           (write fact)
           (newline)
           (display "  rule: ")
           (write (caddr entry))
           (newline)
           (display "  premises:")
           (newline)
           (for-each
             (lambda (p)
               (display "    ")
               (write p)
               (newline))
             (cadddr entry)))
          (else
           (display "UNKNOWN_EXPLANATION ")
           (write entry)
           (newline)))))

(define (pairs lst)
  (let outer ((remaining lst) (acc '()))
    (if (null? remaining)
        acc
        (let inner ((rest (cdr remaining)) (a acc))
          (if (null? rest)
              (outer (cdr remaining) a)
              (inner (cdr rest) (cons (cons (car remaining) (car rest)) a)))))))

(define (same-prefix? prefix xs)
  (cond ((null? prefix) #t)
        ((null? xs) #f)
        ((equal? (car prefix) (car xs)) (same-prefix? (cdr prefix) (cdr xs)))
        (else #f)))

(define (functional-violation? decl a b)
  (let* ((pred (cadr decl))
         (key-prefix (cddr decl))
         (value-index (+ 1 (length key-prefix))))
    (and (pair? a) (pair? b)
         (eq? (car a) pred)
         (eq? (car b) pred)
         (same-prefix? key-prefix (cdr a))
         (same-prefix? key-prefix (cdr b))
         (> (length a) value-index)
         (> (length b) value-index)
         (not (equal? (list-ref a value-index) (list-ref b value-index))))))

(define (find-contradictions facts)
  (let ((functional-decls
         (filter (lambda (f) (and (pair? f) (eq? (car f) 'functional))) facts)))
    (append
      (filter-map
        (lambda (f)
          (and (pair? f) (eq? (car f) 'not) (member (cadr f) facts)
               (list 'contradiction 'negation (cadr f))))
        facts)
      (filter-map
        (lambda (pr)
          (let ((a (car pr)) (b (cdr pr)))
            (let loop ((decls functional-decls))
              (cond ((null? decls) #f)
                    ((functional-violation? (car decls) a b)
                     (list 'contradiction 'functional (car decls) a b))
                    (else (loop (cdr decls)))))))
        (pairs (filter (lambda (f)
                         (not (and (pair? f) (eq? (car f) 'predicate))))
                       facts)))
      (filter (lambda (f) (and (pair? f) (eq? (car f) 'contradiction))) facts))))

(define (consistent? facts rules)
  (null? (find-contradictions (run-to-fixpoint facts rules))))

(define (defined-nodes facts)
  (filter-map
    (lambda (f) (and (pair? f) (eq? (car f) 'memory-node) (caddr f)))
    facts))

(define (find-dangling facts)
  (let ((nodes (defined-nodes facts)))
    (filter-map
      (lambda (f)
        (and (pair? f) (eq? (car f) 'references)
             (not (memq (caddr f) nodes))
             (list 'dangling (cadr f) (caddr f))))
      facts)))

(define *valid-memory-types*
  '(environment task entity preference domain rule source lifecycle note))

(define (find-structure-errors facts)
  (filter-map
    (lambda (f)
      (and (pair? f) (eq? (car f) 'memory-node)
           (not (memq (cadr f) *valid-memory-types*))
           (list 'bad-memory-type (cadr f) (caddr f))))
    facts))

(define (find-duplicates lst)
  (let loop ((l lst) (seen '()) (dups '()))
    (cond ((null? l) (reverse dups))
          ((and (pair? (car l)) (eq? (car (car l)) 'predicate))
           (loop (cdr l) seen dups))
          ((and (member (car l) seen) (not (member (car l) dups)))
           (loop (cdr l) seen (cons (car l) dups)))
          (else (loop (cdr l) (cons (car l) seen) dups)))))

;;; introspection: derive (predicate name arity) facts from *facts*.

(define (fact-predicate-entry f)
  (and (pair? f)
       (symbol? (car f))
       (cons (car f) (length (cdr f)))))

;; Depends on fact! (defined in kb.scm, not engine.scm) — calling this
;; before kb.scm is loaded will error on unbound fact!.
;; One-shot: re-calling injects duplicate (predicate ...) facts;
;; find-duplicates in this file guards against that (engine.scm:225).

(define (inject-predicate-facts!)
  (let loop ((fs *facts*) (seen '()))
    (cond ((null? fs)
           (for-each
             (lambda (entry)
               (fact! (list 'predicate (car entry) (cdr entry))))
             (reverse seen)))
          ((fact-predicate-entry (car fs))
           => (lambda (entry)
                (if (member entry seen)
                    (loop (cdr fs) seen)
                    (loop (cdr fs) (cons entry seen)))))
          (else (loop (cdr fs) seen)))))
