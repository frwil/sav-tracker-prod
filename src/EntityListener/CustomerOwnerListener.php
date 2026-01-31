<?php

namespace App\EntityListener;

use App\Entity\Customer;
use App\Entity\User;
use Symfony\Bundle\SecurityBundle\Security;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsEntityListener;
use Doctrine\ORM\Events;
use Doctrine\ORM\Event\PrePersistEventArgs;

#[AsEntityListener(event: Events::prePersist, method: 'prePersist', entity: Customer::class)]
class CustomerOwnerListener
{
    public function __construct(private Security $security)
    {
    }

    public function prePersist(Customer $customer, PrePersistEventArgs $event): void
    {
        $user = $this->security->getUser();

        if ($user instanceof User) {
            // 1. Traceur immuable (Qui a créé la fiche ?)
            if (!$customer->getCreatedBy()) {
                $customer->setCreatedBy($user);
            }

            // 2. Responsable actuel (Qui gère le client ?)
            // Si le créateur est un technicien (et non un admin qui prépare le terrain),
            // il s'auto-affecte le client pour pouvoir le voir.
            if (!$customer->getAffectedTo() && in_array('ROLE_TECHNICIAN', $user->getRoles())) {
                $customer->setAffectedTo($user);
            }
        }
    }
}