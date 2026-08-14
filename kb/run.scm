;;; run.scm -- CLI functions for the generic KB.

(define (print-line x)
  (write x)
  (newline))

(define (cli-recall pattern)
  (let* ((facts (run-to-fixpoint *facts* *rules*))
         (hits (filter (lambda (f) (not (eq? 'fail (match pattern f '())))) facts)))
    (if (null? hits)
        (display "NO_MATCH\n")
        (for-each print-line hits))
    (exit 0)))

(define (cli-check)
  (let* ((facts (run-to-fixpoint *facts* *rules*))
         (cs (find-contradictions facts))
         (dg (find-dangling facts))
         (st (find-structure-errors facts))
         (du (find-duplicates *facts*)))
    (define (report label items)
      (display label)
      (display ": ")
      (if (null? items)
          (display "ok\n")
          (begin
            (newline)
            (for-each
              (lambda (x)
                (display "  ")
                (write x)
                (newline))
              items))))
    (report "contradictions" cs)
    (report "dangling" dg)
    (report "structure" st)
    (report "duplicates" du)
    (exit (if (and (null? cs) (null? st)) 0 1))))

(define (cli-test-fact new)
  (let ((base (run-to-fixpoint *facts* *rules*)))
    (cond
      ((member new base)
       (display "REDUNDANT ")
       (write new)
       (newline)
       (exit 2))
      (else
       (let* ((after (run-to-fixpoint (cons new *facts*) *rules*))
              (cs (find-contradictions after)))
         (if (null? cs)
             (begin
               (display "OK ")
               (write new)
               (newline)
               (display "derived-delta: ")
               (write (filter (lambda (f) (not (member f base))) after))
               (newline)
               (exit 0))
             (begin
               (display "REJECT\n")
               (for-each
                 (lambda (c)
                   (display "  ")
                   (write c)
                   (newline))
                 cs)
               (exit 1))))))))

(define (cli-explain pattern)
  (let* ((result (run-to-fixpoint/explain *facts* *rules*))
         (facts (car result))
         (provenance (cdr result))
         (hits (filter (lambda (f) (not (eq? 'fail (match pattern f '())))) facts)))
    (if (null? hits)
        (display "NO_MATCH\n")
        (for-each
          (lambda (hit)
            (explain-fact hit provenance))
          hits))
    (exit 0)))

;;; ---- AI-first query interface (2026-08-14) ----
;;; 3 个 CLI 入口,让 AI 用统一方式查 KB:
;;;   cli-for-action '(create-entity "SysTenant")    → 该动作触发哪些 invariant?
;;;   cli-for-symptom "PSQLException"                 → 哪些 fact 关联这个错误?
;;;   cli-by-severity 'blocker                        → 哪些 invariant 是 blocker?

(define (substring? needle haystack)
  (let ((n (string-length needle))
        (h (string-length haystack)))
    (if (> n h)
        #f
        (let loop ((i 0))
          (cond ((> (+ i n) h) #f)
                ((string=? (substring haystack i (+ i n)) needle) #t)
                (else (loop (+ i 1))))))))

;; 找到与 fact-slug 对应的 (invariant ...) fact。两种 schema 都兼容:
;;   (invariant <slug-as-symbol> "<text>")        — slug 是 cadr
;;   (invariant <domain> "<slug>: <text>")        — slug 在 caddr 的字符串里
(define (find-invariant-for-slug slug facts)
  (let ((slug-str (symbol->string slug)))
    (filter (lambda (f)
              (and (pair? f)
                   (eq? (car f) 'invariant)
                   (pair? (cdr f))
                   (or
                     ;; schema A: (invariant <slug> "...") — cadr 是 symbol 且等于 slug
                     (and (symbol? (cadr f)) (eq? (cadr f) slug))
                     ;; schema B: (invariant <domain> "<slug>: ...") — caddr 含 slug
                     (and (pair? (cddr f))
                          (string? (caddr f))
                          (substring? slug-str (caddr f))))))
            facts)))

(define (cli-for-action action-pattern)
  ;; action-pattern 形如 '(create-entity "SysTenant") 或 '(create-entity ?)
  ;; 返回所有 trigger 匹配的 fact-slug 列表,加上原 invariant 文本。
  (let* ((facts (run-to-fixpoint *facts* *rules*))
         (trigger-hits
           (filter (lambda (f)
                     (and (pair? f)
                          (eq? (car f) 'trigger)
                          (pair? (cddr f))
                          (pair? (caddr f))
                          (let ((do-form (caddr f)))
                            (and (pair? do-form)
                                 (eq? (car do-form) 'do)
                                 (not (eq? 'fail (match action-pattern (cdr do-form) '())))))))
                   facts))
         (slugs (map cadr trigger-hits)))
    (if (null? slugs)
        (display "NO_TRIGGER\n")
        (begin
          (display "TRIGGERED_INVARIANTS:\n")
          (for-each
            (lambda (slug)
              (display "  slug: ") (write slug) (newline)
              (for-each
                (lambda (i)
                  (display "    ") (write i) (newline))
                (find-invariant-for-slug slug facts)))
            slugs)))
    (exit 0)))

(define (cli-for-symptom needle)
  ;; needle 是字符串,匹配所有 (symptom <slug> "<pattern>") 中 <pattern> 包含 needle 的。
  (let* ((facts (run-to-fixpoint *facts* *rules*))
         (hits (filter (lambda (f)
                         (and (pair? f)
                              (eq? (car f) 'symptom)
                              (pair? (cddr f))
                              (string? (caddr f))
                              (substring? needle (caddr f))))
                       facts)))
    (if (null? hits)
        (display "NO_SYMPTOM_MATCH\n")
        (begin
          (display "MATCHED_FACTS:\n")
          (for-each
            (lambda (h)
              (let ((slug (cadr h)))
                (display "  slug: ") (write slug) (newline)
                (display "  symptom: ") (write (caddr h)) (newline)
                (for-each
                  (lambda (i) (display "  fact: ") (write i) (newline))
                  (find-invariant-for-slug slug facts))
                (newline)))
            hits)))
    (exit 0)))

(define (cli-by-severity level)
  ;; level 是 'blocker / 'high / 'medium / 'low
  (let* ((facts (run-to-fixpoint *facts* *rules*))
         (hits (filter (lambda (f)
                         (and (pair? f)
                              (eq? (car f) 'severity)
                              (pair? (cddr f))
                              (eq? (caddr f) level)))
                       facts)))
    (if (null? hits)
        (display "NO_MATCH\n")
        (begin
          (display "INVARIANTS_WITH_SEVERITY_")
          (write level)
          (display ":\n")
          (for-each
            (lambda (h)
              (let ((slug (cadr h)))
                (display "  ") (write slug) (newline)))
            hits)))
    (exit 0)))
