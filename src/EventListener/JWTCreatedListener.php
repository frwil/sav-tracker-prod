<?php

namespace App\EventListener;

use App\Entity\User;
use Lexik\Bundle\JWTAuthenticationBundle\Event\JWTCreatedEvent;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;

class JWTCreatedListener
{
    #[AsEventListener(event: 'lexik_jwt_authentication.on_jwt_created')]
    public function onJWTCreated(JWTCreatedEvent $event): void
    {
        $user = $event->getUser();

        // Sécurité : s'assurer qu'on a bien un User entité
        if (!$user instanceof User) {
            return;
        }

        $payload = $event->getData();

        // INJECTION DE L'ID
        $payload['id'] = $user->getId();
        
        // Ajout des rôles et nom complet
        $payload['roles'] = $user->getRoles();
        if (method_exists($user, 'getFullname')) {
            $payload['fullname'] = $user->getFullname();
        }

        $event->setData($payload);
    }
}