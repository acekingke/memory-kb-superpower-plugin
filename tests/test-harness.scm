;;; test-harness.scm -- tiny assertion helpers for Scheme tests.

(define *fail-count* 0)

(define (check-expect label actual expected)
  (if (equal? actual expected)
      (begin (display "PASS ") (display label) (newline))
      (begin
        (set! *fail-count* (+ *fail-count* 1))
        (display "FAIL ") (display label)
        (display " | got=") (write actual)
        (display " want=") (write expected) (newline))))

(define (test-summary)
  (display "---- ") (display *fail-count*) (display " failure(s)") (newline)
  (exit (if (> *fail-count* 0) 1 0)))
