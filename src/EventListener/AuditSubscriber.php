<?php

namespace App\EventListener;

use App\Entity\User;
use App\Entity\AuditLog;
use Doctrine\ORM\Events;
use Doctrine\ORM\Event\OnFlushEventArgs;
use Symfony\Bundle\SecurityBundle\Security;
use Doctrine\Common\EventSubscriber;

class AuditSubscriber implements EventSubscriber
{
    public function __construct(private Security $security)
    {
    }

    public function getSubscribedEvents(): array
    {
        return [
            Events::onFlush,
        ];
    }

    public function onFlush(OnFlushEventArgs $args): void
    {
        $em = $args->getObjectManager();
        $uow = $em->getUnitOfWork();
        
        // On récupère l'utilisateur connecté
        $user = $this->security->getUser();
        $username = $user instanceof User ? $user->getEmail() : 'Anonyme/Système';

        // 1. INSERTIONS
        foreach ($uow->getScheduledEntityInsertions() as $entity) {
            if ($entity instanceof AuditLog) continue; // On n'audite pas les logs eux-mêmes

            $log = new AuditLog();
            $log->setAction('CREATE');
            $log->setEntityClass(get_class($entity));
            $log->setUsername($username);
            // Note: L'ID n'est pas encore dispo si c'est un auto-increment, 
            // on pourrait le récupérer en postPersist, mais ici on simplifie.
            
            $this->persistLog($em, $log);
        }

        // 2. MISES À JOUR
        foreach ($uow->getScheduledEntityUpdates() as $entity) {
            if ($entity instanceof AuditLog) continue;

            $changeset = $uow->getEntityChangeSet($entity);
            
            $log = new AuditLog();
            $log->setAction('UPDATE');
            $log->setEntityClass(get_class($entity));
            $log->setEntityId((string) $entity->getId());
            $log->setUsername($username);
            $log->setChanges($changeset); // On stocke ce qui a changé

            $this->persistLog($em, $log);
        }

        // 3. SUPPRESSIONS
        foreach ($uow->getScheduledEntityDeletions() as $entity) {
            if ($entity instanceof AuditLog) continue;

            $log = new AuditLog();
            $log->setAction('DELETE');
            $log->setEntityClass(get_class($entity));
            $log->setEntityId((string) $entity->getId());
            $log->setUsername($username);
            // On peut stocker l'état final avant suppression si besoin
            $log->setChanges($this->serializeEntity($entity)); 

            $this->persistLog($em, $log);
        }
    }

    private function persistLog($em, AuditLog $log): void
    {
        $em->persist($log);
        // CRUCIAL : On force le calcul des changements pour ce nouvel objet Log
        // car on est déjà à l'intérieur du processus de flush.
        $em->getUnitOfWork()->computeChangeSet(
            $em->getClassMetadata(AuditLog::class),
            $log
        );
    }

    private function serializeEntity($entity): array
    {
        // Méthode utilitaire simple pour stocker quelques infos de l'entité supprimée
        $data = [];
        if (method_exists($entity, 'getName')) $data['name'] = $entity->getName();
        if (method_exists($entity, 'getId')) $data['id'] = $entity->getId();
        return $data;
    }
}