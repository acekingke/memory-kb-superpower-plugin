;;; kb.scm -- generic memory knowledge base.
;;; This file intentionally contains generic defaults only.

(define *facts* '())
(define *rules* '())

(define (fact! f)
  (set! *facts* (cons f *facts*)))

(define (rule! name premises conclusions)
  (set! *rules* (cons (list name premises conclusions) *rules*)))

;; ---- generic schema nodes ----
(fact! '(memory-node environment environment-schema))
(fact! '(memory-node task task-schema))
(fact! '(memory-node entity entity-schema))
(fact! '(memory-node preference preference-schema))
(fact! '(memory-node domain domain-schema))
(fact! '(memory-node rule rule-schema))
(fact! '(memory-node source source-schema))
(fact! '(memory-node lifecycle lifecycle-schema))

;; ---- generic lifecycle and scope vocabulary ----
(fact! '(scope-type global))
(fact! '(scope-type project))
(fact! '(scope-type repo))
(fact! '(scope-type session))
(fact! '(scope-type domain))

(fact! '(lifecycle-type ephemeral))
(fact! '(lifecycle-type session))
(fact! '(lifecycle-type project))
(fact! '(lifecycle-type long-term))
(fact! '(lifecycle-type archived))

;; ---- generic action vocabulary ----
(fact! '(action-effect do))
(fact! '(action-effect avoid))
(fact! '(action-effect must))
(fact! '(action-effect ask-user))
(fact! '(action-effect contradiction))

;; ---- functional declarations ----
;; A declaration has shape (functional <predicate> <fixed-arg-prefix>...).
;; It means matching facts with the same predicate and fixed prefix must not
;; disagree on the next argument.
(fact! '(functional today))
(fact! '(functional timezone))
(fact! '(functional cwd))
(fact! '(functional current-repo))
(fact! '(functional current-branch))
(fact! '(functional current-session))
(fact! '(functional prefers user language))
(fact! '(functional prefers user answer-style))

;; ---- generic task rules ----
(rule! 'task-ready-by-dependency
       '((done ?dependency) (dep ?task ?dependency))
       '((ready ?task)))

(rule! 'reject-task-done-while-blocked
       '((status ?task done) (status ?task blocked))
       '((contradiction "Task cannot be both done and blocked" ?task)))

(rule! 'reject-task-done-while-in-progress
       '((status ?task done) (status ?task in-progress))
       '((contradiction "Task cannot be both done and in-progress" ?task)))

;; ---- generic action rules ----
(rule! 'reject-forbidden-action
       '((do ?action ?target) (forbidden ?action ?target))
       '((contradiction "Forbidden action" ?action ?target)))

(rule! 'ask-before-sensitive-action
       '((do ?action ?target) (sensitive-action ?action))
       '((ask-user "Sensitive action requires confirmation" ?action ?target)))

;; ---- generic business modeling rules ----
(rule! 'reject-invalid-transition
       '((do transition ?domain ?from ?to)
         (invalid-transition ?domain ?from ?to))
       '((contradiction "Invalid domain state transition" ?domain ?from ?to)))

(rule! 'reject-forbidden-domain-relation
       '((domain-relation ?domain ?rel ?from ?to)
         (forbidden-domain-relation ?domain ?rel ?from ?to))
       '((contradiction "Forbidden domain relation" ?domain ?rel ?from ?to)))

(rule! 'reject-domain-capability-above-level
       '((domain-capability ?domain ?actor ?capability)
         (domain-level ?domain ?actor ?actor-level)
         (domain-level ?domain ?capability ?capability-level)
         (greater-than ?capability-level ?actor-level))
       '((contradiction "Domain actor has capability above its level"
                        ?domain ?actor ?capability)))

;; ---- user memories are appended below this line by checked tools ----
;; MANUAL MEMORY START
(fact! '(status promote-plugin in-progress))
(fact! '(task promote-plugin make-repo-public publish-tweet))
(fact! '(dep publish-tweet make-repo-public))
;; MANUAL MEMORY END

;; ---- introspection ----
;; Derives (predicate name arity) facts from everything fact!'d above.
;; If you fact! a new predicate AFTER this line, reload kb.scm (or call
;; inject-predicate-facts! again) to refresh the predicate table.
(inject-predicate-facts!)
